// @postpilot/queue — shared BullMQ-based message queue client, queue config, and DLQ pattern

import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq'
import type { PostPilotEvent, TopicName } from '@postpilot/events'
import { TOPICS } from '@postpilot/events'
import Redis from 'ioredis'

// ─── Idempotency store ─────────────────────────────────────────────────────

export interface IdempotencyStore {
  has(eventId: string): Promise<boolean>
  mark(eventId: string): Promise<void>
}

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60 // 24 hours

/** In-memory idempotency store with TTL-based eviction. For testing/dev only. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, number>()
  private readonly ttlMs: number

  constructor(ttlMs: number = IDEMPOTENCY_TTL_SECONDS * 1000) {
    this.ttlMs = ttlMs
  }

  async has(eventId: string): Promise<boolean> {
    const expiresAt = this.store.get(eventId)
    if (expiresAt === undefined) return false
    if (Date.now() > expiresAt) {
      this.store.delete(eventId)
      return false
    }
    return true
  }

  async mark(eventId: string): Promise<void> {
    this.store.set(eventId, Date.now() + this.ttlMs)
  }
}

/** Redis-backed idempotency store using SET NX EX for atomic deduplication. */
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly redis: Redis
  private readonly ttlSeconds: number

  constructor(redisUrl: string, ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS) {
    this.redis = new Redis(redisUrl, { lazyConnect: true })
    this.ttlSeconds = ttlSeconds
  }

  async has(eventId: string): Promise<boolean> {
    const val = await this.redis.get(`idempotency:${eventId}`)
    return val !== null
  }

  async mark(eventId: string): Promise<void> {
    await this.redis.set(`idempotency:${eventId}`, '1', 'EX', this.ttlSeconds, 'NX')
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
  }
}

// ─── Queue naming ──────────────────────────────────────────────────────────

/** Prefix for all PostPilot queues */
const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? 'postpilot'

/** Convert dot-notation topic name to queue-compatible name.
 *  e.g. 'asset.uploaded' → 'postpilot-asset-uploaded' */
export function toQueueName(topicName: string): string {
  return `${QUEUE_PREFIX}-${topicName.replace(/\./g, '-')}`
}

/** DLQ suffix */
export const DLQ_SUFFIX = '-dlq'

/** Convert dot-notation topic name to DLQ queue name.
 *  e.g. 'asset.uploaded' → 'postpilot-asset-uploaded-dlq' */
export function toDlqName(topicName: string): string {
  return `${toQueueName(topicName)}${DLQ_SUFFIX}`
}

// ─── Queue configuration ───────────────────────────────────────────────────

export interface QueueConfig {
  /** Original dot-notation topic name (e.g. 'asset.uploaded') */
  topicName: string
  /** Queue name (e.g. 'postpilot-asset-uploaded') */
  queueName: string
  /** Max receive count before message moves to DLQ */
  maxReceiveCount: number
}

/** All required pipeline queues with their configuration */
export const QUEUE_CONFIGS: QueueConfig[] = [
  { topicName: TOPICS.ASSET_UPLOADED,          queueName: toQueueName(TOPICS.ASSET_UPLOADED),          maxReceiveCount: 3 },
  { topicName: TOPICS.ASSET_COMPRESSED,        queueName: toQueueName(TOPICS.ASSET_COMPRESSED),        maxReceiveCount: 3 },
  { topicName: TOPICS.ASSET_ADAPTED,           queueName: toQueueName(TOPICS.ASSET_ADAPTED),           maxReceiveCount: 3 },
  { topicName: TOPICS.ASSET_REPURPOSED,        queueName: toQueueName(TOPICS.ASSET_REPURPOSED),        maxReceiveCount: 3 },
  { topicName: TOPICS.ASSET_QUALITY_SHORTFALL, queueName: toQueueName(TOPICS.ASSET_QUALITY_SHORTFALL), maxReceiveCount: 3 },
  { topicName: TOPICS.TARGETING_READY,         queueName: toQueueName(TOPICS.TARGETING_READY),         maxReceiveCount: 3 },
  { topicName: TOPICS.POST_SCHEDULED,          queueName: toQueueName(TOPICS.POST_SCHEDULED),          maxReceiveCount: 3 },
  { topicName: TOPICS.POST_PUBLISHED,          queueName: toQueueName(TOPICS.POST_PUBLISHED),          maxReceiveCount: 3 },
  { topicName: TOPICS.POST_FAILED,             queueName: toQueueName(TOPICS.POST_FAILED),             maxReceiveCount: 3 },
  { topicName: TOPICS.CHANNEL_TOKEN_EXPIRED,   queueName: toQueueName(TOPICS.CHANNEL_TOKEN_EXPIRED),   maxReceiveCount: 3 },
]

/** Dead-letter queue names — one per pipeline queue */
export const DLQ_CONFIGS: Array<{ topicName: string; queueName: string }> = QUEUE_CONFIGS.map((q) => ({
  topicName: q.topicName,
  queueName: toDlqName(q.topicName),
}))

// ─── Redis connection / queue client factory ──────────────────────────────

export interface QueueClientOptions {
  /** Redis URL (e.g. redis://localhost:6379). Falls back to REDIS_URL env var. */
  redisUrl?: string
}

export interface QueueClient {
  connection: ConnectionOptions
  redisUrl: string
}

/**
 * Create a queue client configuration for BullMQ.
 * Uses REDIS_URL environment variable by default.
 */
export function createQueueClient(options?: QueueClientOptions): QueueClient {
  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379'

  return {
    connection: { url: redisUrl } as ConnectionOptions,
    redisUrl,
  }
}



// ─── Queue provisioning ───────────────────────────────────────────────────

/**
 * Ensures all pipeline queues exist by performing a connection test.
 * BullMQ auto-creates queues on first use, so this primarily validates
 * the Redis connection is healthy.
 */
export async function ensureQueues(client: QueueClient): Promise<void> {
  const redis = new Redis(client.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 })
  try {
    await redis.connect()
    await redis.ping()
    console.log('[queue] Redis connection verified — all queues will be auto-provisioned by BullMQ')
  } finally {
    await redis.quit()
  }
}

// ─── Typed producer ────────────────────────────────────────────────────────

/** Internal cache of queue name → BullMQ Queue instance */
const queueInstances = new Map<string, Queue>()

function getOrCreateQueue(queueName: string, connection: ConnectionOptions): Queue {
  let queue = queueInstances.get(queueName)
  if (!queue) {
    queue = new Queue(queueName, { connection })
    queueInstances.set(queueName, queue)
  }
  return queue
}

export interface TypedProducer {
  publish(event: PostPilotEvent): Promise<void>
  disconnect(): Promise<void>
}

export function createProducer(client: QueueClient): TypedProducer {
  return {
    async publish(event: PostPilotEvent): Promise<void> {
      const queueName = toQueueName(event.type)
      const queue = getOrCreateQueue(queueName, client.connection)

      await queue.add(event.type, event, {
        jobId: event.eventId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 24 * 3600 },  // keep completed jobs for 24h
        removeOnFail: { age: 7 * 24 * 3600 },  // keep failed jobs for 7 days
      })
    },

    async disconnect(): Promise<void> {
      const closePromises = Array.from(queueInstances.values()).map((q) => q.close())
      await Promise.all(closePromises)
      queueInstances.clear()
    },
  }
}

// ─── Typed consumer ────────────────────────────────────────────────────────

export type EventHandler<T extends PostPilotEvent = PostPilotEvent> = (
  event: T
) => Promise<void>

export interface ConsumerOptions {
  /** Queue topic names to consume (dot-notation, e.g. 'asset.uploaded') */
  queues: TopicName[]
  /** Max retries per job (application-level). Defaults to 3. */
  maxRetries?: number
  /** Optional idempotency store for deduplication by eventId. */
  idempotencyStore?: IdempotencyStore
  /** Concurrency — number of jobs processed in parallel per worker. Defaults to 1. */
  concurrency?: number
}

export interface TypedConsumer {
  subscribe<T extends PostPilotEvent>(
    eventType: T['type'],
    handler: EventHandler<T>
  ): void
  start(): Promise<void>
  stop(): Promise<void>
}

export function createConsumer(
  client: QueueClient,
  options: ConsumerOptions
): TypedConsumer {
  const handlers = new Map<string, EventHandler>()
  const maxRetries = options.maxRetries ?? 3
  const idempotencyStore = options.idempotencyStore
  const concurrency = options.concurrency ?? 1
  const workers: Worker[] = []

  return {
    subscribe<T extends PostPilotEvent>(
      eventType: T['type'],
      handler: EventHandler<T>
    ): void {
      handlers.set(eventType, handler as EventHandler)
    },

    async start(): Promise<void> {
      for (const topicName of options.queues) {
        const queueName = toQueueName(topicName)

        const worker = new Worker(
          queueName,
          async (job: Job<PostPilotEvent>) => {
            const event = job.data

            // Idempotency check — skip already-processed events
            if (idempotencyStore) {
              const seen = await idempotencyStore.has(event.eventId)
              if (seen) {
                console.debug(`[queue] skipping duplicate event ${event.eventId} (type: ${event.type})`)
                return
              }
            }

            const handler = handlers.get(event.type)
            if (!handler) {
              console.warn(`[queue] no handler registered for event type: ${event.type}`)
              return
            }

            await handler(event)

            // Mark as processed only after successful handling
            if (idempotencyStore) {
              await idempotencyStore.mark(event.eventId)
            }
          },
          {
            connection: client.connection,
            concurrency,
            autorun: true,
          }
        )

        worker.on('failed', (job, err) => {
          const attemptsMade = job?.attemptsMade ?? 0
          console.error(
            `[queue] handler error for ${job?.name ?? 'unknown'} (attempt ${attemptsMade}/${maxRetries}):`,
            err
          )

          // If all retries exhausted, BullMQ automatically moves the job to the failed set.
          // This is equivalent to a dead-letter queue (DLQ) behaviour.
          if (attemptsMade >= maxRetries) {
            console.error(
              `[queue] all ${maxRetries} retries exhausted for event ${job?.data?.eventId ?? 'unknown'} on ${queueName}. ` +
                'Job moved to failed set (equivalent to DLQ).'
            )
          }
        })

        worker.on('error', (err) => {
          console.error(`[queue] worker error on ${queueName}:`, err)
        })

        workers.push(worker)
        console.log(`[queue] worker started for queue: ${queueName}`)
      }
    },

    async stop(): Promise<void> {
      const closePromises = workers.map((w) => w.close())
      await Promise.all(closePromises)
      workers.length = 0
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Re-exports ────────────────────────────────────────────────────────────

export { TOPICS } from '@postpilot/events'
export type { PostPilotEvent, TopicName } from '@postpilot/events'
