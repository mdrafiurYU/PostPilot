// Integration test: 48-hour ingestion trigger
// Verifies that a metric ingestion job is scheduled and fires at the correct
// time after receiving a `post.published` event.
// Feature: post-pilot, Task 17.4
// Validates: Requirements 5.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PostMetrics } from '@postpilot/types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  getPostById: vi.fn(),
  getChannelById: vi.fn(),
  insertPostMetrics: vi.fn(),
  getMetricsByPostId: vi.fn(),
  getMetricsByCreatorAndRange: vi.fn(),
  getPublishedPostsByCreator: vi.fn(),
  getPublishedPostsByChannel: vi.fn(),
  insertInsight: vi.fn(),
  getInsightByPostId: vi.fn(),
}))

vi.mock('./vault.js', () => ({
  getTokens: vi.fn().mockResolvedValue({
    access_token: 'stub_access',
    refresh_token: 'stub_refresh',
    expires_at: Date.now() + 3_600_000,
  }),
}))

vi.mock('./platformAdapters.js', () => ({
  getAnalyticsAdapter: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

function makePost(publishedAt: Date) {
  return {
    id: 'post-trigger-1',
    creator_id: 'creator-1',
    channel_id: 'channel-1',
    scheduled_at: publishedAt,
    published_at: publishedAt,
    platform_post_id: 'platform-post-1',
    status: 'published' as const,
    retry_count: 0,
    created_at: publishedAt,
    updated_at: publishedAt,
  }
}

function makeChannel() {
  return {
    id: 'channel-1',
    creator_id: 'creator-1',
    platform: 'instagram' as const,
    platform_user_id: 'ig-user-1',
    platform_username: 'testuser',
    token_vault_key: 'vault/channel-1',
    token_expires_at: new Date(Date.now() + 3_600_000),
    status: 'active' as const,
    post_count: 20,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('48-hour ingestion trigger (Req 5.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules ingestion job 48 hours after published_at and fires getMetrics at that time', async () => {
    const { getPostById, getChannelById, getMetricsByPostId, insertPostMetrics } = await import('./db.js')
    const { getAnalyticsAdapter } = await import('./platformAdapters.js')
    const { handlePostPublished } = await import('./metricIngestion.js')

    const publishedAt = new Date()
    const post = makePost(publishedAt)
    const channel = makeChannel()

    const mockGetMetrics = vi.fn().mockResolvedValue({
      views: 5000,
      likes: 200,
      comments: 30,
      shares: 15,
      watch_time_seconds: 900,
      engagement_rate: 0.049,
    })

    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getAnalyticsAdapter as ReturnType<typeof vi.fn>).mockReturnValue({ getMetrics: mockGetMetrics })
    ;(insertPostMetrics as ReturnType<typeof vi.fn>).mockImplementation(async (m: PostMetrics) => m)

    // Simulate receiving the post.published event
    handlePostPublished({
      postId: 'post-trigger-1',
      channelId: 'channel-1',
      publishedAt: publishedAt.toISOString(),
      platformPostId: 'platform-post-1',
    })

    // Job should NOT have fired yet — getMetrics not called before 48h
    expect(mockGetMetrics).not.toHaveBeenCalled()

    // Advance time to exactly 48 hours and flush all pending timers/promises
    vi.advanceTimersByTime(FORTY_EIGHT_HOURS_MS)
    await vi.runAllTimersAsync()

    // Ingestion job should have fired and called getMetrics
    expect(mockGetMetrics).toHaveBeenCalledTimes(1)
    expect(mockGetMetrics).toHaveBeenCalledWith(post, channel, expect.objectContaining({ access_token: 'stub_access' }))
  })

  it('does NOT fire ingestion before 48 hours have elapsed', async () => {
    const { getPostById, getChannelById, getMetricsByPostId, insertPostMetrics } = await import('./db.js')
    const { getAnalyticsAdapter } = await import('./platformAdapters.js')
    const { handlePostPublished } = await import('./metricIngestion.js')

    const publishedAt = new Date()
    const post = makePost(publishedAt)
    const channel = makeChannel()

    const mockGetMetrics = vi.fn().mockResolvedValue({ views: 100 })

    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getAnalyticsAdapter as ReturnType<typeof vi.fn>).mockReturnValue({ getMetrics: mockGetMetrics })
    ;(insertPostMetrics as ReturnType<typeof vi.fn>).mockImplementation(async (m: PostMetrics) => m)

    handlePostPublished({
      postId: 'post-trigger-1',
      channelId: 'channel-1',
      publishedAt: publishedAt.toISOString(),
      platformPostId: 'platform-post-1',
    })

    // Advance to just under 48 hours (47h 59m 59s) — do NOT flush remaining timers
    vi.advanceTimersByTime(FORTY_EIGHT_HOURS_MS - 1000)
    // Allow any microtasks that may have been queued to settle
    await Promise.resolve()

    expect(mockGetMetrics).not.toHaveBeenCalled()
  })

  it('persists metrics to the database after ingestion fires', async () => {
    const { getPostById, getChannelById, getMetricsByPostId, insertPostMetrics } = await import('./db.js')
    const { getAnalyticsAdapter } = await import('./platformAdapters.js')
    const { handlePostPublished } = await import('./metricIngestion.js')

    const publishedAt = new Date()
    const post = makePost(publishedAt)
    const channel = makeChannel()

    const rawMetrics = { views: 8000, likes: 400, comments: 60, shares: 25, watch_time_seconds: 1200, engagement_rate: 0.06 }

    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getAnalyticsAdapter as ReturnType<typeof vi.fn>).mockReturnValue({ getMetrics: vi.fn().mockResolvedValue(rawMetrics) })
    ;(insertPostMetrics as ReturnType<typeof vi.fn>).mockImplementation(async (m: PostMetrics) => m)

    handlePostPublished({
      postId: 'post-trigger-1',
      channelId: 'channel-1',
      publishedAt: publishedAt.toISOString(),
      platformPostId: 'platform-post-1',
    })

    vi.advanceTimersByTime(FORTY_EIGHT_HOURS_MS)
    await vi.runAllTimersAsync()

    expect(insertPostMetrics).toHaveBeenCalledTimes(1)
    const saved = (insertPostMetrics as ReturnType<typeof vi.fn>).mock.calls[0][0] as PostMetrics
    expect(saved.post_id).toBe('post-trigger-1')
    expect(saved.views).toBe(8000)
    expect(saved.engagement_rate).toBe(0.06)
  })
})
