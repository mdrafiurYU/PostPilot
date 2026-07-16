import { createLogger } from '@postpilot/logger'
const logger = createLogger('compression-engine')

// Compression Engine message bus
// Consumes: asset.uploaded
// Produces: asset.compressed, asset.quality_shortfall

import {
  createQueueClient,
  createProducer,
  createConsumer,
  ensureQueues,
  TOPICS,
  RedisIdempotencyStore,
  type TypedProducer,
  type TypedConsumer,
  type EventHandler,
} from '@postpilot/queue'
import type { PostPilotEvent, AssetUploadedEvent } from '@postpilot/events'

const queueClient = createQueueClient()

let producer: TypedProducer | null = null
let consumer: TypedConsumer | null = null

async function getProducer(): Promise<TypedProducer> {
  if (!producer) {
    producer = createProducer(queueClient)
  }
  return producer
}

export async function publishEvent(event: PostPilotEvent): Promise<void> {
  const p = await getProducer()
  await p.publish(event)
}

export function subscribe<T extends PostPilotEvent>(
  eventType: T['type'],
  handler: EventHandler<T>
): void {
  if (!consumer) {
    throw new Error('[messageBus] call startConsuming() before subscribe()')
  }
  consumer.subscribe(eventType, handler)
}

export async function startConsuming(): Promise<void> {
  await ensureQueues(queueClient)

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
  consumer = createConsumer(queueClient, {
    queues: [TOPICS.ASSET_UPLOADED],
    idempotencyStore: new RedisIdempotencyStore(redisUrl),
  })
  await consumer.start()
}

export async function stopConsuming(): Promise<void> {
  if (consumer) {
    await consumer.stop()
    consumer = null
  }
}

export async function disconnect(): Promise<void> {
  await stopConsuming()
  if (producer) {
    await producer.disconnect()
    producer = null
  }
}

/** Simulate receiving an event (used in tests and local dev) */
export async function simulateEvent(event: PostPilotEvent): Promise<void> {
  if (!consumer) {
    logger.warn('[messageBus] no consumer active — call startConsuming() first')
    return
  }
  // Re-use the consumer's internal handler map via a direct publish + consume cycle
  // For tests, wire handlers directly via subscribe() after calling startConsuming()
  logger.warn('[messageBus] simulateEvent is for local dev only')
}
