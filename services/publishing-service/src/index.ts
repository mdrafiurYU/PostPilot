import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('publishing-service')

// Publishing Service — Express HTTP server
// Manages scheduled posts, batch operations, and dispatches to platform adapters.

import express, { type Express } from 'express'
import type { Request, Response } from 'express'
import type { PostStatus } from '@postpilot/types'
import {
  insertPost,
  getPostById,
  updatePostStatus,
  insertBatch,
  getBatchById,
} from './db.js'
import { publishEvent } from './messageBus.js'
import { startSchedulerLoop } from './scheduler.js'
import { broadcastBatchStatusUpdate, registerBatchClient } from './batchBroadcast.js'

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

// ─── SSE: in-memory subscriber map ────────────────────────────────────────
// Subscriber management is handled by batchBroadcast.ts

// ─── POST /posts — create a scheduled post ─────────────────────────────────

app.post('/posts', async (req: Request, res: Response) => {
  const { creator_id, channel_id, scheduled_at, asset_id, clip_id, caption_id, batch_id } =
    req.body as Record<string, unknown>

  if (typeof creator_id !== 'string' || !creator_id) {
    return res.status(422).json({ error: 'creator_id is required' })
  }
  if (typeof channel_id !== 'string' || !channel_id) {
    return res.status(422).json({ error: 'channel_id is required' })
  }
  if (typeof scheduled_at !== 'string' || !scheduled_at) {
    return res.status(422).json({ error: 'scheduled_at is required' })
  }

  const scheduledDate = new Date(scheduled_at)
  if (isNaN(scheduledDate.getTime())) {
    return res.status(422).json({ error: 'scheduled_at must be a valid ISO date' })
  }

  const now = new Date()
  const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  if (scheduledDate <= now) {
    return res.status(422).json({ error: 'scheduled_at must be in the future' })
  }
  if (scheduledDate > maxDate) {
    return res.status(422).json({ error: 'scheduled_at must be within 90 days from now' })
  }

  const id = crypto.randomUUID()
  const nowTs = new Date()

  const post = await insertPost({
    id,
    creator_id: creator_id as string,
    channel_id: channel_id as string,
    asset_id: typeof asset_id === 'string' ? asset_id : undefined,
    clip_id: typeof clip_id === 'string' ? clip_id : undefined,
    caption_id: typeof caption_id === 'string' ? caption_id : undefined,
    batch_id: typeof batch_id === 'string' ? batch_id : undefined,
    scheduled_at: scheduledDate,
    status: 'scheduled',
    retry_count: 0,
    created_at: nowTs,
    updated_at: nowTs,
  })

  await publishEvent({
    eventId: crypto.randomUUID(),
    occurredAt: nowTs.toISOString(),
    type: 'post.scheduled',
    payload: {
      postId: post.id,
      channelId: post.channel_id,
      scheduledAt: post.scheduled_at.toISOString(),
    },
  })

  logger.info(`[publishing-service] post created: ${post.id}`)
  return res.status(201).json(post)
})

// ─── POST /batches — create a batch of posts ───────────────────────────────

app.post('/batches', async (req: Request, res: Response) => {
  const { creator_id, name, post_ids } = req.body as Record<string, unknown>

  if (typeof creator_id !== 'string' || !creator_id) {
    return res.status(422).json({ error: 'creator_id is required' })
  }
  if (typeof name !== 'string' || !name) {
    return res.status(422).json({ error: 'name is required' })
  }
  if (!Array.isArray(post_ids)) {
    return res.status(422).json({ error: 'post_ids must be an array' })
  }
  if (post_ids.length < 1 || post_ids.length > 50) {
    return res.status(422).json({ error: 'post_ids must contain between 1 and 50 entries' })
  }

  const id = crypto.randomUUID()
  const nowTs = new Date()

  const batch = await insertBatch({
    id,
    creator_id: creator_id as string,
    name: name as string,
    post_ids: post_ids as string[],
    status: 'scheduled',
    created_at: nowTs,
    updated_at: nowTs,
  })

  logger.info(`[publishing-service] batch created: ${batch.id}`)
  return res.status(201).json(batch)
})

// ─── GET /posts/:id ────────────────────────────────────────────────────────

app.get('/posts/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const post = await getPostById(id)
  if (!post) {
    return res.status(404).json({ error: 'Post not found' })
  }
  return res.status(200).json(post)
})

// ─── GET /batches/:id ──────────────────────────────────────────────────────

app.get('/batches/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const batch = await getBatchById(id)
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' })
  }
  return res.status(200).json(batch)
})

// ─── PATCH /posts/:id — cancel or reschedule ───────────────────────────────

app.patch('/posts/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { action, scheduled_at } = req.body as Record<string, unknown>

  const post = await getPostById(id)
  if (!post) {
    return res.status(404).json({ error: 'Post not found' })
  }

  const cancellableStatuses: PostStatus[] = ['draft', 'scheduled']
  const nonCancellableStatuses: PostStatus[] = ['publishing', 'published', 'failed', 'cancelled']

  if (nonCancellableStatuses.includes(post.status)) {
    return res.status(409).json({
      error: `Cannot modify post with status '${post.status}'`,
    })
  }

  if (!cancellableStatuses.includes(post.status)) {
    return res.status(409).json({ error: `Cannot modify post with status '${post.status}'` })
  }

  if (action === 'cancel') {
    await updatePostStatus(id, 'cancelled')
    const updated = await getPostById(id)
    return res.status(200).json(updated)
  }

  if (action === 'reschedule') {
    if (typeof scheduled_at !== 'string' || !scheduled_at) {
      return res.status(422).json({ error: 'scheduled_at is required for reschedule' })
    }

    const newDate = new Date(scheduled_at)
    if (isNaN(newDate.getTime())) {
      return res.status(422).json({ error: 'scheduled_at must be a valid ISO date' })
    }

    const now = new Date()
    const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    if (newDate <= now) {
      return res.status(422).json({ error: 'scheduled_at must be in the future' })
    }
    if (newDate > maxDate) {
      return res.status(422).json({ error: 'scheduled_at must be within 90 days from now' })
    }

    await updatePostStatus(id, 'scheduled', { scheduled_at: newDate })
    const updated = await getPostById(id)
    return res.status(200).json(updated)
  }

  return res.status(422).json({ error: "action must be 'cancel' or 'reschedule'" })
})

// ─── GET /batches/:id/stream — SSE endpoint ────────────────────────────────

app.get('/batches/:id/stream', (req: Request, res: Response) => {
  const { id } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Register client — returns cleanup function for disconnect
  const cleanup = registerBatchClient(id, res)

  logger.info(`[publishing-service] SSE client connected for batch ${id}`)

  // Heartbeat every 15 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15_000)

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat)
    cleanup()
    logger.info(`[publishing-service] SSE client disconnected for batch ${id}`)
  })
})

// ─── Health check ─────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'publishing-service', uptime: process.uptime() })
})

// ─── Start server ──────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3005

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`[publishing-service] listening on port ${PORT}`)
  })
  startSchedulerLoop()
}

export { app }
