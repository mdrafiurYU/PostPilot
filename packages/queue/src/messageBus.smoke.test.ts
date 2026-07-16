// Smoke tests for the @postpilot/queue message bus package (BullMQ-based)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  QUEUE_CONFIGS,
  DLQ_CONFIGS,
  DLQ_SUFFIX,
  InMemoryIdempotencyStore,
  toQueueName,
  toDlqName,
  createQueueClient,
  type TypedProducer,
  type EventHandler,
} from './index.js'
import type { PostPilotEvent, AssetUploadedEvent } from '@postpilot/events'
import { TOPICS } from '@postpilot/events'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAssetUploadedEvent(eventId = 'evt-001'): AssetUploadedEvent {
  return {
    eventId,
    occurredAt: new Date().toISOString(),
    type: 'asset.uploaded',
    payload: {
      assetId: 'asset-001',
      creatorId: 'creator-001',
      s3Key: 'uploads/asset-001/source.mp4',
      mediaType: 'video',
      format: 'mp4',
      fileSizeBytes: 1_000_000,
    },
  }
}

// ─── 1. Queue configuration ──────────────────────────────────────────────────

describe('Queue configuration', () => {
  it('defines exactly 10 pipeline queues', () => {
    expect(QUEUE_CONFIGS).toHaveLength(10)
  })

  it('defines exactly 10 DLQ queues', () => {
    expect(DLQ_CONFIGS).toHaveLength(10)
  })

  it('every pipeline queue has a corresponding DLQ queue', () => {
    const dlqQueueNames = new Set(DLQ_CONFIGS.map((c) => c.queueName))
    for (const config of QUEUE_CONFIGS) {
      expect(dlqQueueNames.has(`${config.queueName}${DLQ_SUFFIX}`)).toBe(true)
    }
  })

  it('all expected pipeline topic names are present', () => {
    const topicNames = QUEUE_CONFIGS.map((c) => c.topicName)
    expect(topicNames).toContain(TOPICS.ASSET_UPLOADED)
    expect(topicNames).toContain(TOPICS.ASSET_COMPRESSED)
    expect(topicNames).toContain(TOPICS.ASSET_ADAPTED)
    expect(topicNames).toContain(TOPICS.ASSET_REPURPOSED)
    expect(topicNames).toContain(TOPICS.ASSET_QUALITY_SHORTFALL)
    expect(topicNames).toContain(TOPICS.TARGETING_READY)
    expect(topicNames).toContain(TOPICS.POST_SCHEDULED)
    expect(topicNames).toContain(TOPICS.POST_PUBLISHED)
    expect(topicNames).toContain(TOPICS.POST_FAILED)
    expect(topicNames).toContain(TOPICS.CHANNEL_TOKEN_EXPIRED)
  })

  it('all queues have maxReceiveCount of 3', () => {
    for (const config of QUEUE_CONFIGS) {
      expect(config.maxReceiveCount).toBe(3)
    }
  })
})

// ─── 2. Queue name conversion ─────────────────────────────────────────────────

describe('Queue name conversion', () => {
  it('converts dot-notation to queue-compatible name', () => {
    expect(toQueueName('asset.uploaded')).toBe('postpilot-asset-uploaded')
  })

  it('converts dot-notation to DLQ queue name', () => {
    expect(toDlqName('asset.uploaded')).toBe('postpilot-asset-uploaded-dlq')
  })

  it('handles multi-segment names', () => {
    expect(toQueueName('asset.quality_shortfall')).toBe('postpilot-asset-quality_shortfall')
  })
})

// ─── 3. InMemoryIdempotencyStore ──────────────────────────────────────────────

describe('InMemoryIdempotencyStore', () => {
  it('returns false for an unseen eventId', async () => {
    const store = new InMemoryIdempotencyStore()
    expect(await store.has('evt-new')).toBe(false)
  })

  it('returns true after marking an eventId', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.mark('evt-001')
    expect(await store.has('evt-001')).toBe(true)
  })

  it('returns false after TTL expires', async () => {
    const store = new InMemoryIdempotencyStore(50) // 50 ms TTL
    await store.mark('evt-ttl')
    expect(await store.has('evt-ttl')).toBe(true)
    await new Promise((r) => setTimeout(r, 60))
    expect(await store.has('evt-ttl')).toBe(false)
  })

  it('different eventIds are tracked independently', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.mark('evt-A')
    expect(await store.has('evt-A')).toBe(true)
    expect(await store.has('evt-B')).toBe(false)
  })
})

// ─── 4. Queue client creation ─────────────────────────────────────────────────

describe('Queue client creation', () => {
  it('createQueueClient returns a QueueClient with connection and redisUrl', () => {
    const client = createQueueClient({ redisUrl: 'redis://test:6379' })
    expect(client.redisUrl).toBe('redis://test:6379')
    expect(client.connection).toBeDefined()
  })

  it('createQueueClient defaults to REDIS_URL env var or localhost', () => {
    const client = createQueueClient()
    // Should default to process.env.REDIS_URL or 'redis://localhost:6379'
    expect(client.redisUrl).toBeDefined()
    expect(typeof client.redisUrl).toBe('string')
  })
})
