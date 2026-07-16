// Unit and property-based tests for Publishing Service HTTP endpoints
// Feature: post-pilot, Task 10.3, 10.4, 10.5, 10.10, 10.11, 10.13
// Requirements: 4.1, 4.2, 4.7, 4.8

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import type { Post, Batch } from '@postpilot/types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  insertPost: vi.fn(),
  getPostById: vi.fn(),
  updatePostStatus: vi.fn().mockResolvedValue(undefined),
  insertBatch: vi.fn(),
  getBatchById: vi.fn(),
  getScheduledPostsDue: vi.fn().mockResolvedValue([]),
  getChannelById: vi.fn(),
  updateChannelStatus: vi.fn().mockResolvedValue(undefined),
  cancelPostsByChannel: vi.fn().mockResolvedValue(undefined),
  updateBatchStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./messageBus.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./vault.js', () => ({
  getTokens: vi.fn().mockResolvedValue({
    access_token: 'stub_access',
    refresh_token: 'stub_refresh',
    expires_at: Date.now() + 3600_000,
  }),
}))

vi.mock('./scheduler.js', () => ({
  startSchedulerLoop: vi.fn(),
  PlatformApiError: class PlatformApiError extends Error {
    statusCode: number
    constructor(statusCode: number, message: string) {
      super(message)
      this.statusCode = statusCode
    }
  },
  handlePublishError: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    creator_id: 'creator-1',
    channel_id: 'channel-1',
    scheduled_at: new Date(Date.now() + 3600_000),
    status: 'scheduled',
    retry_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: 'batch-1',
    creator_id: 'creator-1',
    name: 'Test Batch',
    post_ids: ['post-1'],
    status: 'scheduled',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

// ─── POST /posts — scheduling window enforcement ───────────────────────────────

describe('POST /posts — scheduling window enforcement (Req 4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a post scheduled 1 hour from now', async () => {
    const { insertPost } = await import('./db.js')
    const { publishEvent } = await import('./messageBus.js')
    const { app } = await import('./index.js')

    const post = makePost()
    ;(insertPost as ReturnType<typeof vi.fn>).mockResolvedValue(post)

    const { default: supertest } = await import('supertest')
    const res = await supertest(app)
      .post('/posts')
      .send({
        creator_id: 'creator-1',
        channel_id: 'channel-1',
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      })

    expect(res.status).toBe(201)
    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'post.scheduled' }))
  })

  it('accepts a post scheduled exactly 90 days from now', async () => {
    const { insertPost } = await import('./db.js')
    const { app } = await import('./index.js')

    const post = makePost({ scheduled_at: new Date(Date.now() + 90 * 24 * 3600_000 - 1000) })
    ;(insertPost as ReturnType<typeof vi.fn>).mockResolvedValue(post)

    const { default: supertest } = await import('supertest')
    const res = await supertest(app)
      .post('/posts')
      .send({
        creator_id: 'creator-1',
        channel_id: 'channel-1',
        scheduled_at: new Date(Date.now() + 90 * 24 * 3600_000 - 1000).toISOString(),
      })

    expect(res.status).toBe(201)
  })

  it('rejects a post scheduled in the past', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app)
      .post('/posts')
      .send({
        creator_id: 'creator-1',
        channel_id: 'channel-1',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
      })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/future/i)
  })

  it('rejects a post scheduled more than 90 days from now', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app)
      .post('/posts')
      .send({
        creator_id: 'creator-1',
        channel_id: 'channel-1',
        scheduled_at: new Date(Date.now() + 91 * 24 * 3600_000).toISOString(),
      })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/90 days/i)
  })

  it('rejects a post with missing creator_id', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app)
      .post('/posts')
      .send({
        channel_id: 'channel-1',
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      })

    expect(res.status).toBe(422)
  })
})

// ─── Property 10: Scheduling window enforcement ────────────────────────────────
// Feature: post-pilot, Property 10: Scheduling window enforcement
// Validates: Requirements 4.1

describe('Property 10: Scheduling window enforcement', () => {
  it('accepts dates in (now, now+90d] and rejects all others', async () => {
    const { insertPost } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const now = Date.now()
    const maxMs = 90 * 24 * 3600_000

    ;(insertPost as ReturnType<typeof vi.fn>).mockImplementation(async (p: Post) => p)

    await fc.assert(
      fc.asyncProperty(
        // Generate offsets: some valid (1ms to 90d), some invalid (past or >90d)
        fc.oneof(
          fc.integer({ min: 1_000, max: maxMs - 1_000 }).map((offset) => ({ offset, valid: true })),
          fc.integer({ min: -86_400_000, max: -1 }).map((offset) => ({ offset, valid: false })),
          fc.integer({ min: maxMs + 1_000, max: maxMs + 86_400_000 }).map((offset) => ({ offset, valid: false }))
        ),
        async ({ offset, valid }) => {
          vi.clearAllMocks()
          ;(insertPost as ReturnType<typeof vi.fn>).mockImplementation(async (p: Post) => p)

          const scheduledAt = new Date(now + offset).toISOString()
          const res = await supertest(app)
            .post('/posts')
            .send({ creator_id: 'c1', channel_id: 'ch1', scheduled_at: scheduledAt })

          if (valid) {
            expect(res.status).toBe(201)
          } else {
            expect(res.status).toBe(422)
          }
        }
      ),
      { numRuns: 50 }
    )
  }, 30_000)
})

// ─── POST /batches — batch size enforcement ────────────────────────────────────

describe('POST /batches — batch size enforcement (Req 4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a batch of 1 post', async () => {
    const { insertBatch } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const batch = makeBatch({ post_ids: ['post-1'] })
    ;(insertBatch as ReturnType<typeof vi.fn>).mockResolvedValue(batch)

    const res = await supertest(app)
      .post('/batches')
      .send({ creator_id: 'creator-1', name: 'Batch 1', post_ids: ['post-1'] })

    expect(res.status).toBe(201)
  })

  it('accepts a batch of 50 posts', async () => {
    const { insertBatch } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const postIds = Array.from({ length: 50 }, (_, i) => `post-${i}`)
    const batch = makeBatch({ post_ids: postIds })
    ;(insertBatch as ReturnType<typeof vi.fn>).mockResolvedValue(batch)

    const res = await supertest(app)
      .post('/batches')
      .send({ creator_id: 'creator-1', name: 'Batch 50', post_ids: postIds })

    expect(res.status).toBe(201)
  })

  it('rejects a batch of 51 posts', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const postIds = Array.from({ length: 51 }, (_, i) => `post-${i}`)
    const res = await supertest(app)
      .post('/batches')
      .send({ creator_id: 'creator-1', name: 'Batch 51', post_ids: postIds })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/50/i)
  })

  it('rejects a batch with 0 posts', async () => {
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const res = await supertest(app)
      .post('/batches')
      .send({ creator_id: 'creator-1', name: 'Empty', post_ids: [] })

    expect(res.status).toBe(422)
  })
})

// ─── Property 11: Batch size enforcement ──────────────────────────────────────
// Feature: post-pilot, Property 11: Batch size enforcement
// Validates: Requirements 4.2

describe('Property 11: Batch size enforcement', () => {
  it('accepts 1–50 posts and rejects >50', async () => {
    const { insertBatch } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: 1, max: 50 }).map((n) => ({ n, valid: true })),
          fc.integer({ min: 51, max: 200 }).map((n) => ({ n, valid: false }))
        ),
        async ({ n, valid }) => {
          vi.clearAllMocks()
          const postIds = Array.from({ length: n }, (_, i) => `post-${i}`)
          ;(insertBatch as ReturnType<typeof vi.fn>).mockImplementation(async (b: Batch) => b)

          const res = await supertest(app)
            .post('/batches')
            .send({ creator_id: 'c1', name: 'B', post_ids: postIds })

          if (valid) {
            expect(res.status).toBe(201)
          } else {
            expect(res.status).toBe(422)
          }
        }
      ),
      { numRuns: 50 }
    )
  }, 30_000)
})

// ─── PATCH /posts/:id — cancellation and rescheduling (Req 4.7) ───────────────

describe('PATCH /posts/:id — cancellation and rescheduling (Req 4.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancels a scheduled post', async () => {
    const { getPostById, updatePostStatus } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const post = makePost({ status: 'scheduled' })
    const cancelledPost = makePost({ status: 'cancelled' })
    ;(getPostById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(post)
      .mockResolvedValueOnce(cancelledPost)

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'cancel' })

    expect(res.status).toBe(200)
    expect(updatePostStatus).toHaveBeenCalledWith('post-1', 'cancelled')
  })

  it('cancels a draft post', async () => {
    const { getPostById, updatePostStatus } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const post = makePost({ status: 'draft' })
    const cancelledPost = makePost({ status: 'cancelled' })
    ;(getPostById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(post)
      .mockResolvedValueOnce(cancelledPost)

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'cancel' })

    expect(res.status).toBe(200)
    expect(updatePostStatus).toHaveBeenCalledWith('post-1', 'cancelled')
  })

  it('reschedules a scheduled post to a new valid time', async () => {
    const { getPostById, updatePostStatus } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const newTime = new Date(Date.now() + 7200_000)
    const post = makePost({ status: 'scheduled' })
    const rescheduledPost = makePost({ status: 'scheduled', scheduled_at: newTime })
    ;(getPostById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(post)
      .mockResolvedValueOnce(rescheduledPost)

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'reschedule', scheduled_at: newTime.toISOString() })

    expect(res.status).toBe(200)
    expect(updatePostStatus).toHaveBeenCalledWith(
      'post-1',
      'scheduled',
      expect.objectContaining({ scheduled_at: expect.any(Date) })
    )
  })

  it('rejects cancel for a published post', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(makePost({ status: 'published' }))

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'cancel' })

    expect(res.status).toBe(409)
  })

  it('rejects cancel for a post currently publishing', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(makePost({ status: 'publishing' }))

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'cancel' })

    expect(res.status).toBe(409)
  })

  it('rejects cancel for a failed post', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(makePost({ status: 'failed' }))

    const res = await supertest(app)
      .patch('/posts/post-1')
      .send({ action: 'cancel' })

    expect(res.status).toBe(409)
  })

  it('returns 404 for non-existent post', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await supertest(app)
      .patch('/posts/nonexistent')
      .send({ action: 'cancel' })

    expect(res.status).toBe(404)
  })
})

// ─── Property 14: Pre-publish cancellation ────────────────────────────────────
// Feature: post-pilot, Property 14: Pre-publish cancellation
// Validates: Requirements 4.7

describe('Property 14: Pre-publish cancellation', () => {
  it('cancel/reschedule succeeds for draft and scheduled posts, fails for others', async () => {
    const { getPostById, updatePostStatus } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const cancellableStatuses = ['draft', 'scheduled'] as const
    const nonCancellableStatuses = ['publishing', 'published', 'failed', 'cancelled'] as const

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constantFrom(...cancellableStatuses).map((s) => ({ status: s, shouldSucceed: true })),
          fc.constantFrom(...nonCancellableStatuses).map((s) => ({ status: s, shouldSucceed: false }))
        ),
        async ({ status, shouldSucceed }) => {
          vi.clearAllMocks()

          const post = makePost({ status })
          const cancelledPost = makePost({ status: 'cancelled' })
          ;(getPostById as ReturnType<typeof vi.fn>)
            .mockReset()
            .mockResolvedValueOnce(post)
            .mockResolvedValueOnce(cancelledPost)
          ;(updatePostStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

          const res = await supertest(app)
            .patch('/posts/post-1')
            .send({ action: 'cancel' })

          if (shouldSucceed) {
            expect(res.status).toBe(200)
            expect(updatePostStatus).toHaveBeenCalledWith('post-1', 'cancelled')
          } else {
            expect(res.status).toBe(409)
          }
        }
      ),
      { numRuns: 30 }
    )
  }, 30_000)
})

// ─── GET /posts/:id and GET /batches/:id ──────────────────────────────────────

describe('GET /posts/:id', () => {
  it('returns 200 with post data for existing post', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const post = makePost()
    ;(getPostById as ReturnType<typeof vi.fn>).mockResolvedValue(post)

    const res = await supertest(app).get('/posts/post-1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('post-1')
  })

  it('returns 404 for non-existent post', async () => {
    const { getPostById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getPostById as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(null)

    const res = await supertest(app).get('/posts/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('GET /batches/:id', () => {
  it('returns 200 with batch data for existing batch', async () => {
    const { getBatchById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    const batch = makeBatch()
    ;(getBatchById as ReturnType<typeof vi.fn>).mockResolvedValue(batch)

    const res = await supertest(app).get('/batches/batch-1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('batch-1')
  })

  it('returns 404 for non-existent batch', async () => {
    const { getBatchById } = await import('./db.js')
    const { app } = await import('./index.js')
    const { default: supertest } = await import('supertest')

    ;(getBatchById as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await supertest(app).get('/batches/nonexistent')
    expect(res.status).toBe(404)
  })
})
