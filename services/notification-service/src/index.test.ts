// Unit tests for Notification Service
// Tests: trigger conditions, notification types, delivery failure isolation

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  PostPublishedEvent,
  PostFailedEvent,
  AssetQualityShortfallEvent,
  ChannelTokenExpiredEvent,
} from '@postpilot/events'

// ─── Mock dependencies ────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  insertNotification: vi.fn(async (n) => ({ ...n, read: false, created_at: new Date() })),
  getNotificationsByCreator: vi.fn(async () => []),
  markNotificationRead: vi.fn(async () => {}),
}))

vi.mock('./websocket.js', () => ({
  broadcastInApp: vi.fn(),
  attachWebSocketServer: vi.fn(),
}))

vi.mock('./pushProvider.js', () => ({
  sendPushNotification: vi.fn(async () => {}),
}))

vi.mock('./emailProvider.js', () => ({
  sendEmail: vi.fn(async () => {}),
  getCreatorEmail: vi.fn(async () => 'creator@example.com'),
}))

import { insertNotification } from './db.js'
import { broadcastInApp } from './websocket.js'
import { sendPushNotification } from './pushProvider.js'
import { sendEmail, getCreatorEmail } from './emailProvider.js'
import {
  handlePostPublished,
  handlePostFailed,
  handleQualityShortfall,
  handleTokenExpired,
} from './notificationRouter.js'

// ─── Helpers ──────────────────────────────────────────────────────────────

function makePostPublishedEvent(): PostPublishedEvent {
  return {
    eventId: 'evt-1',
    occurredAt: new Date().toISOString(),
    type: 'post.published',
    payload: { postId: 'post-1', channelId: 'ch-1', publishedAt: new Date().toISOString(), platformPostId: 'plat-123' },
  }
}

function makePostFailedEvent(): PostFailedEvent {
  return {
    eventId: 'evt-2',
    occurredAt: new Date().toISOString(),
    type: 'post.failed',
    payload: { postId: 'post-2', channelId: 'ch-1', error: 'Rate limit exceeded', retryCount: 3 },
  }
}

function makeQualityShortfallEvent(): AssetQualityShortfallEvent {
  return {
    eventId: 'evt-3',
    occurredAt: new Date().toISOString(),
    type: 'asset.quality_shortfall',
    payload: { assetId: 'asset-1', renditionId: 'rend-1', targetVmaf: 93, achievedVmaf: 81 },
  }
}

function makeTokenExpiredEvent(): ChannelTokenExpiredEvent {
  return {
    eventId: 'evt-4',
    occurredAt: new Date().toISOString(),
    type: 'channel.token_expired',
    payload: { channelId: 'ch-1', creatorId: 'creator-1', platform: 'instagram' },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('handlePostPublished', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists an in-app notification', async () => {
    await handlePostPublished(makePostPublishedEvent(), 'creator-1')
    expect(insertNotification).toHaveBeenCalledOnce()
    const call = vi.mocked(insertNotification).mock.calls[0][0]
    expect(call.type).toBe('post_published')
    expect(call.channel).toBe('in_app')
    expect(call.creator_id).toBe('creator-1')
  })

  it('broadcasts via WebSocket', async () => {
    await handlePostPublished(makePostPublishedEvent(), 'creator-1')
    expect(broadcastInApp).toHaveBeenCalledOnce()
  })

  it('does NOT send push or email for post.published', async () => {
    await handlePostPublished(makePostPublishedEvent(), 'creator-1')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('handlePostFailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists in-app, push, and email notifications', async () => {
    await handlePostFailed(makePostFailedEvent(), 'creator-1')
    const calls = vi.mocked(insertNotification).mock.calls.map((c) => c[0].channel)
    expect(calls).toContain('in_app')
    expect(calls).toContain('push')
    expect(calls).toContain('email')
  })

  it('sends a push notification', async () => {
    await handlePostFailed(makePostFailedEvent(), 'creator-1')
    expect(sendPushNotification).toHaveBeenCalledOnce()
  })

  it('sends an email notification', async () => {
    await handlePostFailed(makePostFailedEvent(), 'creator-1')
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('does not throw if push delivery fails', async () => {
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('FCM unavailable'))
    await expect(handlePostFailed(makePostFailedEvent(), 'creator-1')).resolves.not.toThrow()
  })

  it('does not throw if email delivery fails', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SES unavailable'))
    await expect(handlePostFailed(makePostFailedEvent(), 'creator-1')).resolves.not.toThrow()
  })
})

describe('handleQualityShortfall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists an in-app notification with correct type', async () => {
    await handleQualityShortfall(makeQualityShortfallEvent(), 'creator-1')
    expect(insertNotification).toHaveBeenCalledOnce()
    const call = vi.mocked(insertNotification).mock.calls[0][0]
    expect(call.type).toBe('quality_shortfall')
    expect(call.channel).toBe('in_app')
  })

  it('does NOT send push or email for quality shortfall', async () => {
    await handleQualityShortfall(makeQualityShortfallEvent(), 'creator-1')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('handleTokenExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists in-app, push, and email notifications', async () => {
    await handleTokenExpired(makeTokenExpiredEvent())
    const calls = vi.mocked(insertNotification).mock.calls.map((c) => c[0].channel)
    expect(calls).toContain('in_app')
    expect(calls).toContain('push')
    expect(calls).toContain('email')
  })

  it('uses the creatorId from the event payload', async () => {
    await handleTokenExpired(makeTokenExpiredEvent())
    const calls = vi.mocked(insertNotification).mock.calls.map((c) => c[0].creator_id)
    expect(calls.every((id) => id === 'creator-1')).toBe(true)
  })

  it('does not throw if email address is unavailable', async () => {
    vi.mocked(getCreatorEmail).mockResolvedValueOnce(null)
    await expect(handleTokenExpired(makeTokenExpiredEvent())).resolves.not.toThrow()
  })

  it('does not throw if push delivery fails', async () => {
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('APNs timeout'))
    await expect(handleTokenExpired(makeTokenExpiredEvent())).resolves.not.toThrow()
  })
})
