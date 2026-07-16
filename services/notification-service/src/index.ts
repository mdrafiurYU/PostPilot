import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('notification-service')

// Notification Service — Express HTTP server + WebSocket
// Consumes message bus events and delivers in-app, push, and email notifications.
// Requirements: 1.7, 4.5, 6.4, 7.10

import http from 'http'
import express, { type Express, type Request, type Response } from 'express'
import { attachWebSocketServer } from './websocket.js'
import { getNotificationsByCreator, markNotificationRead } from './db.js'
import {
  handleAssetAdapted,
  handlePostPublished,
  handlePostFailed,
  handleQualityShortfall,
  handleTokenExpired,
} from './notificationRouter.js'
import type {
  AssetAdaptedEvent,
  PostPublishedEvent,
  PostFailedEvent,
  AssetQualityShortfallEvent,
  ChannelTokenExpiredEvent,
  PostPilotEvent,
} from '@postpilot/events'

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

// ─── REST: in-app notification endpoints ──────────────────────────────────

/** GET /notifications?creatorId= — list notifications for a creator */
app.get('/notifications', async (req: Request, res: Response) => {
  const { creatorId } = req.query
  if (typeof creatorId !== 'string' || !creatorId) {
    return res.status(422).json({ error: 'creatorId query param is required' })
  }
  const notifications = await getNotificationsByCreator(creatorId)
  return res.status(200).json(notifications)
})

/** PATCH /notifications/:id/read — mark a notification as read */
app.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  const { id } = req.params
  await markNotificationRead(id)
  return res.status(204).send()
})

// ─── Internal: event ingestion endpoint (called by message bus consumer) ──

/**
 * POST /internal/events — receive a PostPilot event and route it.
 * In production this is replaced by a Kafka/SQS consumer (task 15).
 * The creatorId for post.published / post.failed / asset.quality_shortfall
 * must be resolved by the caller (e.g. API Gateway or message bus consumer).
 */
app.post('/internal/events', async (req: Request, res: Response) => {
  const event = req.body as PostPilotEvent & { creatorId?: string }

  try {
    switch (event.type) {
      case 'asset.adapted':
        await handleAssetAdapted(event as AssetAdaptedEvent)
        break
      case 'post.published':
        if (!event.creatorId)
          return res.status(422).json({ error: 'creatorId required for post.published' })
        await handlePostPublished(event as PostPublishedEvent, event.creatorId)
        break
      case 'post.failed':
        if (!event.creatorId)
          return res.status(422).json({ error: 'creatorId required for post.failed' })
        await handlePostFailed(event as PostFailedEvent, event.creatorId)
        break
      case 'asset.quality_shortfall':
        if (!event.creatorId)
          return res.status(422).json({ error: 'creatorId required for asset.quality_shortfall' })
        await handleQualityShortfall(event as AssetQualityShortfallEvent, event.creatorId)
        break
      case 'channel.token_expired':
        await handleTokenExpired(event as ChannelTokenExpiredEvent)
        break
      default:
        // Ignore unhandled event types
        break
    }
    return res.status(204).send()
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      '[notification-service] event handling error',
    )
    return res.status(500).json({ error: 'Internal error processing event' })
  }
})

// ─── Health check ─────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'notification-service', uptime: process.uptime() })
})

// ─── Start server ──────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3007

if (process.env.NODE_ENV !== 'test') {
  const server = http.createServer(app)
  attachWebSocketServer(server)
  server.listen(PORT, () => {
    logger.info(`[notification-service] listening on port ${PORT}`)
  })
}

export { app }
