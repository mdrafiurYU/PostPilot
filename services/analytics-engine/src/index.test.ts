// Unit tests for Analytics Engine
// Feature: post-pilot, Task 12.8
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostMetrics, Post, Insight } from '@postpilot/types'

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
    expires_at: Date.now() + 3600_000,
  }),
}))

vi.mock('./platformAdapters.js', () => ({
  getAnalyticsAdapter: vi.fn().mockReturnValue({
    getMetrics: vi.fn().mockResolvedValue({
      views: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
      watch_time_seconds: 300,
      engagement_rate: 0.065,
    }),
  }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    creator_id: 'creator-1',
    channel_id: 'channel-1',
    scheduled_at: new Date(),
    published_at: new Date(),
    platform_post_id: 'platform-post-1',
    status: 'published',
    retry_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeMetrics(overrides: Partial<PostMetrics> = {}): PostMetrics {
  return {
    id: 'metrics-1',
    post_id: 'post-1',
    platform: 'instagram',
    ingested_at: new Date(),
    views: 1000,
    likes: 50,
    comments: 10,
    shares: 5,
    watch_time_seconds: 300,
    engagement_rate: 0.065,
    ...overrides,
  }
}

// ─── GET /analytics/dashboard ─────────────────────────────────────────────────

describe('GET /analytics/dashboard (Req 5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 422 when creator_id is missing', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app).get('/analytics/dashboard?range=7')
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/creator_id/i)
  })

  it('returns 422 when range is invalid', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app).get('/analytics/dashboard?creator_id=c1&range=14')
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/range/i)
  })

  it('returns 422 when range is missing', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app).get('/analytics/dashboard?creator_id=c1')
    expect(res.status).toBe(422)
  })

  it('returns 200 with aggregated metrics for range=7', async () => {
    const { getPublishedPostsByCreator, getMetricsByCreatorAndRange } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const posts = [makePost(), makePost({ id: 'post-2' })]
    const metrics = [makeMetrics(), makeMetrics({ id: 'metrics-2', post_id: 'post-2', views: 2000 })]
    ;(getPublishedPostsByCreator as ReturnType<typeof vi.fn>).mockResolvedValue(posts)
    ;(getMetricsByCreatorAndRange as ReturnType<typeof vi.fn>).mockResolvedValue(metrics)

    const res = await supertest(app).get('/analytics/dashboard?creator_id=creator-1&range=7')
    expect(res.status).toBe(200)
    expect(res.body.creator_id).toBe('creator-1')
    expect(res.body.range_days).toBe(7)
    expect(res.body.post_count).toBe(2)
    expect(res.body.aggregate.total_views).toBe(3000)
    expect(res.body.aggregate.total_likes).toBe(100)
  })

  it('returns null aggregates when no metrics exist', async () => {
    const { getPublishedPostsByCreator, getMetricsByCreatorAndRange } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPublishedPostsByCreator as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getMetricsByCreatorAndRange as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await supertest(app).get('/analytics/dashboard?creator_id=creator-1&range=30')
    expect(res.status).toBe(200)
    expect(res.body.aggregate.total_views).toBeNull()
    expect(res.body.aggregate.avg_engagement_rate).toBeNull()
  })

  it('accepts all valid range values: 7, 30, 90', async () => {
    const { getPublishedPostsByCreator, getMetricsByCreatorAndRange } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPublishedPostsByCreator as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getMetricsByCreatorAndRange as ReturnType<typeof vi.fn>).mockResolvedValue([])

    for (const range of ['7', '30', '90']) {
      const res = await supertest(app).get(`/analytics/dashboard?creator_id=c1&range=${range}`)
      expect(res.status).toBe(200)
    }
  })
})

// ─── Insight generation with all-null metrics (edge case for Property 17) ─────

describe('Insight generation — all-null metrics edge case (Req 5.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates insight with exactly 3 factors even when all metrics are null', async () => {
    const { getPostById, getChannelById, getInsightByPostId, insertInsight } = await import('./db.js')
    const { generateInsight } = await import('./insightGeneration.js')

    const post = makePost()
    const channel = {
      id: 'channel-1',
      creator_id: 'creator-1',
      platform: 'instagram' as const,
      platform_user_id: 'ig-user-1',
      platform_username: 'testuser',
      token_vault_key: 'vault/channel-1',
      token_expires_at: new Date(Date.now() + 3600_000),
      status: 'active' as const,
      post_count: 20,
      created_at: new Date(),
      updated_at: new Date(),
    }

    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getInsightByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(insertInsight as ReturnType<typeof vi.fn>).mockImplementation(async (i: Insight) => i)

    // All metrics are null
    const nullMetrics = makeMetrics({
      views: undefined,
      likes: undefined,
      comments: undefined,
      shares: undefined,
      watch_time_seconds: undefined,
      engagement_rate: undefined,
    })

    const insight = await generateInsight(nullMetrics, {})
    expect(insight.factors).toHaveLength(3)
  })
})

// ─── Metric ingestion retry scheduling ────────────────────────────────────────

describe('Metric ingestion retry scheduling (Req 5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries up to 3 times when platform API is unavailable', async () => {
    const { getPostById, getChannelById, getMetricsByPostId, insertPostMetrics } = await import('./db.js')
    const { getAnalyticsAdapter } = await import('./platformAdapters.js')
    const { runIngestionJob } = await import('./metricIngestion.js')

    const post = makePost()
    const channel = {
      id: 'channel-1',
      creator_id: 'creator-1',
      platform: 'instagram' as const,
      platform_user_id: 'ig-user-1',
      platform_username: 'testuser',
      token_vault_key: 'vault/channel-1',
      token_expires_at: new Date(Date.now() + 3600_000),
      status: 'active' as const,
      post_count: 20,
      created_at: new Date(),
      updated_at: new Date(),
    }

    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getAnalyticsAdapter as ReturnType<typeof vi.fn>).mockReturnValue({
      getMetrics: vi.fn().mockRejectedValue(new Error('Platform API unavailable')),
    })

    // First attempt fails — should return null and schedule retry
    const result = await runIngestionJob({
      postId: 'post-1',
      channelId: 'channel-1',
      platform: 'instagram',
      scheduledAt: Date.now(),
      retryCount: 0,
    })

    expect(result).toBeNull()
    expect(insertPostMetrics).not.toHaveBeenCalled()
  })

  it('skips ingestion if metrics already exist (idempotency)', async () => {
    const { getMetricsByPostId } = await import('./db.js')
    const { runIngestionJob } = await import('./metricIngestion.js')

    const existingMetrics = makeMetrics()
    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(existingMetrics)

    const result = await runIngestionJob({
      postId: 'post-1',
      channelId: 'channel-1',
      platform: 'instagram',
      scheduledAt: Date.now(),
      retryCount: 0,
    })

    expect(result).toEqual(existingMetrics)
  })

  it('stores null for unavailable metrics without substituting defaults (Req 5.6)', async () => {
    const { getPostById, getChannelById, getMetricsByPostId, insertPostMetrics } = await import('./db.js')
    const { getAnalyticsAdapter } = await import('./platformAdapters.js')
    const { runIngestionJob } = await import('./metricIngestion.js')

    const post = makePost()
    const channel = {
      id: 'channel-1',
      creator_id: 'creator-1',
      platform: 'instagram' as const,
      platform_user_id: 'ig-user-1',
      platform_username: 'testuser',
      token_vault_key: 'vault/channel-1',
      token_expires_at: new Date(Date.now() + 3600_000),
      status: 'active' as const,
      post_count: 20,
      created_at: new Date(),
      updated_at: new Date(),
    }

    ;(getMetricsByPostId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)
    ;(getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(channel)
    ;(getAnalyticsAdapter as ReturnType<typeof vi.fn>).mockReturnValue({
      getMetrics: vi.fn().mockResolvedValue({
        views: undefined,
        likes: undefined,
        comments: undefined,
        shares: undefined,
        watch_time_seconds: undefined,
        engagement_rate: undefined,
      }),
    })
    ;(insertPostMetrics as ReturnType<typeof vi.fn>).mockImplementation(async (m: PostMetrics) => m)

    await runIngestionJob({
      postId: 'post-1',
      channelId: 'channel-1',
      platform: 'instagram',
      scheduledAt: Date.now(),
      retryCount: 0,
    })

    const savedMetrics = (insertPostMetrics as ReturnType<typeof vi.fn>).mock.calls[0][0] as PostMetrics
    expect(savedMetrics.views).toBeUndefined()
    expect(savedMetrics.likes).toBeUndefined()
    expect(savedMetrics.engagement_rate).toBeUndefined()
  })
})
