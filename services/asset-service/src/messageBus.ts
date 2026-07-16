// Asset Service message bus — produces asset.uploaded

import {
  createQueueClient,
  createProducer,
  ensureQueues,
  type TypedProducer,
} from '@postpilot/queue'
import type { PostPilotEvent } from '@postpilot/events'

const queueClient = createQueueClient()

let producer: TypedProducer | null = null

async function getProducer(): Promise<TypedProducer> {
  if (!producer) {
    await ensureQueues(queueClient)
    producer = createProducer(queueClient)
  }
  return producer
}

export async function publishEvent(event: PostPilotEvent): Promise<void> {
  const p = await getProducer()
  await p.publish(event)
}

export async function disconnect(): Promise<void> {
  if (producer) {
    await producer.disconnect()
    producer = null
  }
}
