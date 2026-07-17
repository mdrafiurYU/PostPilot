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

import type { PostPilotEvent } from '@postpilot/events'

const queueClient = createQueueClient()

let producer: TypedProducer | null = null
let consumer: TypedConsumer | null = null

const pendingSubscriptions: Array<{
  eventType: string
  handler: EventHandler<any>
}> = []

async function getProducer(): Promise<TypedProducer> {
  if (!producer) {
    producer = createProducer(queueClient)
  }
  return producer
}

export async function publishEvent(
  event: PostPilotEvent
): Promise<void> {
  const p = await getProducer()
  await p.publish(event)
}

/**
 * Register event handlers.
 *
 * Can be called before or after startConsuming()
 */
export function subscribe<T extends PostPilotEvent>(
  eventType: T['type'],
  handler: EventHandler<T>
): void {
  if (consumer) {
    consumer.subscribe(eventType,handler)
    return
  }

  pendingSubscriptions.push({eventType,handler,})
}

/**
 * Start queue consumer
 */
export async function startConsuming(): Promise<void> {
  if (consumer) {
    logger.warn('[messageBus] consumer already started')
    return
  }

  await ensureQueues(queueClient)

  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required")
  }

  consumer = createConsumer(queueClient,{
      queues: [TOPICS.ASSET_UPLOADED],
      idempotencyStore: new RedisIdempotencyStore(redisUrl),
    })

  // Register subscriptions created before startup
  for (const subscription of pendingSubscriptions) {
    consumer.subscribe(
      subscription.eventType,
      subscription.handler
    )
  }

  await consumer.start()

  logger.info('[messageBus] consumer started')
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



/**
 * Simulate receiving an event
 * Used only for tests/local development
 */
export async function simulateEvent(event: PostPilotEvent): Promise<void> {
  if (!consumer) {
    logger.warn('[messageBus] no consumer active')
    return
  }

  logger.warn('[messageBus] simulateEvent is for local dev only')
}