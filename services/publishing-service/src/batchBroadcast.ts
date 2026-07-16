// Batch status broadcast — Redis Pub/Sub (production) or in-memory (dev/test)
//
// Problem: with multiple publishing-service replicas, a client connected to
// replica A won't receive status updates published by replica B's scheduler.
//
// Solution: use Redis Pub/Sub as the message bus between replicas.
//   - Scheduler calls broadcastBatchStatusUpdate() → publishes to Redis channel
//   - Each SSE handler subscribes to that Redis channel → forwards to its client
//
// Set BATCH_BROADCAST_PROVIDER=redis to use Redis (requires REDIS_URL).
// Defaults to in-memory when unset (safe for single-replica dev/test).
//
// Channel naming: `batch:status:<batchId>`

import Redis from 'ioredis'
import type { Response } from 'express'
import type { PostStatus } from '@postpilot/types'
import { createLogger } from '@postpilot/logger'

const logger = createLogger('publishing-service')

const useRedis = process.env.BATCH_BROADCAST_PROVIDER === 'redis'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function channelKey(batchId: string): string {
  return `batch:status:${batchId}`
}

// ─── Redis Pub/Sub implementation ─────────────────────────────────────────────

// Separate publisher and subscriber clients — ioredis requires dedicated
// connections for pub and sub (a subscribed client can't issue other commands).
let publisher: Redis | null = null

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(REDIS_URL, { lazyConnect: true })
    publisher.on('error', (err) => logger.error({ err }, '[batchBroadcast] Redis publisher error'))
  }
  return publisher
}

/**
 * Subscribe an SSE Response to a batch's Redis channel.
 * Creates a dedicated subscriber connection per SSE client.
 * Returns a cleanup function to call when the client disconnects.
 */
function redisSubscribe(
  batchId: string,
  res: Response
): () => Promise<void> {
  const subscriber = new Redis(REDIS_URL, { lazyConnect: true })
  subscriber.on('error', (err) => logger.error({ err }, '[batchBroadcast] Redis subscriber error'))

  const channel = channelKey(batchId)

  subscriber.subscribe(channel, (err) => {
    if (err) logger.error({ err, batchId }, '[batchBroadcast] subscribe error')
    else logger.info({ batchId }, '[batchBroadcast] subscribed to batch channel')
  })

  subscriber.on('message', (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`)
  })

  return async () => {
    await subscriber.unsubscribe(channel)
    subscriber.disconnect()
  }
}

async function redisPublish(batchId: string, postId: string, status: PostStatus): Promise<void> {
  const message = JSON.stringify({ postId, status })
  await getPublisher().publish(channelKey(batchId), message)
}

// ─── In-memory fallback (dev / test) ─────────────────────────────────────────

const memSubscribers = new Map<string, Set<Response>>()

function memSubscribe(batchId: string, res: Response): () => Promise<void> {
  if (!memSubscribers.has(batchId)) memSubscribers.set(batchId, new Set())
  memSubscribers.get(batchId)!.add(res)
  return async () => {
    const clients = memSubscribers.get(batchId)
    if (!clients) return
    clients.delete(res)
    if (clients.size === 0) memSubscribers.delete(batchId)
  }
}

function memPublish(batchId: string, postId: string, status: PostStatus): void {
  const clients = memSubscribers.get(batchId)
  if (!clients || clients.size === 0) return
  const data = JSON.stringify({ postId, status })
  for (const res of clients) {
    res.write(`data: ${data}\n\n`)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

if (useRedis) {
  logger.info('[batchBroadcast] using Redis Pub/Sub')
} else {
  logger.info('[batchBroadcast] using in-memory broadcast (set BATCH_BROADCAST_PROVIDER=redis for production)')
}

/**
 * Register an SSE client for a batch.
 * Returns a cleanup function — call it when the client disconnects.
 *
 * Usage in the SSE handler:
 *   const cleanup = registerBatchClient(batchId, res)
 *   req.on('close', () => { cleanup() })
 */
export function registerBatchClient(
  batchId: string,
  res: Response
): () => Promise<void> {
  if (useRedis) return redisSubscribe(batchId, res)
  return memSubscribe(batchId, res)
}

/**
 * Broadcast a per-post status update to all SSE clients subscribed to a batch.
 * Called by the scheduler whenever a post status changes.
 */
export async function broadcastBatchStatusUpdate(
  batchId: string,
  postId: string,
  status: PostStatus
): Promise<void> {
  if (useRedis) {
    await redisPublish(batchId, postId, status)
    return
  }
  memPublish(batchId, postId, status)
}

/**
 * Graceful shutdown — disconnect Redis clients.
 * Call during SIGTERM handling.
 */
export async function disconnectBroadcast(): Promise<void> {
  if (publisher) {
    await publisher.quit()
    publisher = null
  }
}
