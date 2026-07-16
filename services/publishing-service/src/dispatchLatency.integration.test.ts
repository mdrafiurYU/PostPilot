// Integration test: Publishing Service dispatch latency
// Feature: post-pilot
// Validates: Requirements 4.3
//
// Asserts that the time from `scheduled_at` to the platform API call is < 60 seconds.
// The scheduler polls every 10 s with a 60 s lookahead window, so a post with
// scheduled_at <= now + 60 s must be dispatched within the first poll tick.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Post, Channel } from '@postpilot/types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  getScheduledPostsDue: vi.fn(),
  updatePostStatus: vi.fn().mockResolvedValue(undefined),
  getChannelById: vi.fn(),
  updateChannelStatus: vi.fn().mockResolvedValue(undefined),
  cancelPostsByChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./messageBus.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./vault.js', () => ({
  getTokens: vi.fn().mockResolvedValue({
    access_token: 'stub_access',
    refresh_token: 'stub_refresh',
    expires_at: Date.now() + 3_600_000,
  }),
}))

vi.mock('./index.js', () => ({
  broadcastBatchStatusUpdate: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: crypto.randomUUID(),
    creator_id: 'creator-1',
    channel_id: 'channel-1',
    scheduled_at: new Date(),
    status: 'scheduled',
    retry_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'channel-1',
    creator_id: 'creator-1',
    platform: 'tiktok',
    platform_user_id: 'tiktok-user-1',
    platform_username: 'testuser',
    token_vault_key: 'postpilot/channels/channel-1/tokens',
    token_expires_at: new Date(Date.now() + 3_600_000),
    status: 'active',
    post_count: 10,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Publishing Service dispatch latency (Req 4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispatches a post to the platform API within 60 seconds of scheduled_at', async () => {
    // Validates: Requirements 4.3
    const { getScheduledPostsDue, updatePostStatus, getChannelById } = await import('./db.js')
    const { publishEvent } = await import('./messageBus.js')

    // Record when publishPost is called so we can measure latency
    let apiCallTime: number | undefined
    const mockAdapter = {
      publishPost: vi.fn().mockImplementation(async () => {
        apiCallTime = Date.now()
        return { platformPostId: 'platform-post-123', publishedAt: new Date() }
      }),
      refreshToken: vi.fn(),
      revokeToken: vi.fn(),
      getMetrics: vi.fn(),
    }

    // Patch getPlatformAdapter to return our mock
    vi.doMock('./platformAdapters.js', () => ({
      getPlatformAdapter: vi.fn().mockReturnValue(mockAdapter),
    }))

    // Post scheduled_at = now (already due)
    const scheduledAt = new Date()
    const post = makePost({ scheduled_at: scheduledAt })
    const channel = makeChannel()

    ;(getScheduledPostsDue as ReturnType<typeof vi.fn>).mockResolvedValue([post])
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)

    // Use fake timers to control the scheduler loop
    vi.useFakeTimers()
    const wallClockStart = Date.now()

    const { startSchedulerLoop } = await import('./scheduler.js')
    startSchedulerLoop()

    // Advance past the first poll interval (10 s) to trigger the tick
    await vi.advanceTimersByTimeAsync(10_000)

    vi.useRealTimers()

    // The scheduler must have queried for due posts
    expect(getScheduledPostsDue).toHaveBeenCalledTimes(1)

    // The platform adapter must have been called
    expect(mockAdapter.publishPost).toHaveBeenCalledTimes(1)
    expect(apiCallTime).toBeDefined()

    // Latency: time from scheduled_at to the API call
    // With fake timers the wall-clock delta is near-zero; what matters is that
    // the scheduler picked up the post within its first tick (≤ 10 s poll interval,
    // well within the 60 s SLA).
    const latencyMs = (apiCallTime ?? wallClockStart) - scheduledAt.getTime()
    expect(latencyMs).toBeLessThan(60_000)

    // Post should have been marked publishing then published
    expect(updatePostStatus).toHaveBeenCalledWith(post.id, 'publishing')
    expect(updatePostStatus).toHaveBeenCalledWith(
      post.id,
      'published',
      expect.objectContaining({
        platform_post_id: 'platform-post-123',
        published_at: expect.any(Date),
      })
    )

    // post.published event must be emitted
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'post.published' })
    )
  })

  it('scheduler lookahead window is exactly 60 seconds', async () => {
    // Validates: Requirements 4.3
    // The cutoff passed to getScheduledPostsDue must be now + 60 s so that any
    // post with scheduled_at within the next 60 s is picked up on the next tick.
    const { getScheduledPostsDue, getChannelById } = await import('./db.js')

    ;(getScheduledPostsDue as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    vi.useFakeTimers()
    const beforeTick = Date.now()

    const { startSchedulerLoop } = await import('./scheduler.js')
    startSchedulerLoop()

    await vi.advanceTimersByTimeAsync(10_000)

    vi.useRealTimers()

    expect(getScheduledPostsDue).toHaveBeenCalledTimes(1)
    const cutoff = (getScheduledPostsDue as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date

    // cutoff should be approximately beforeTick + 10_000 (tick time) + 60_000 (lookahead)
    const expectedCutoff = beforeTick + 10_000 + 60_000
    const delta = Math.abs(cutoff.getTime() - expectedCutoff)

    // Allow 500 ms tolerance for execution overhead
    expect(delta).toBeLessThan(500)
  })
})
