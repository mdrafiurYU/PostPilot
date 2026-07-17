// Targeting Engine message bus
// Consumes: asset.repurposed
// Produces: targeting.ready

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

  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required")
  }
  consumer = createConsumer(queueClient, {
    queues: [TOPICS.ASSET_REPURPOSED],
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
