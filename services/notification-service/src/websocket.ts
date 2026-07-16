import { createLogger } from '@postpilot/logger'
const logger = createLogger('notification-service')

// WebSocket server for real-time in-app notification delivery
// Requirements: 1.7, 4.5

import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Notification } from './db.js'

// Map of creatorId → set of connected WebSocket clients
const clients = new Map<string, Set<WebSocket>>()

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Clients connect with ?creatorId=<id> query param to subscribe to their notifications.
 */
export function attachWebSocketServer(server: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/notifications' })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`)
    const creatorId = url.searchParams.get('creatorId')

    if (!creatorId) {
      ws.close(1008, 'creatorId query param required')
      return
    }

    if (!clients.has(creatorId)) {
      clients.set(creatorId, new Set())
    }
    clients.get(creatorId)!.add(ws)
    logger.info(
      `[websocket] creator ${creatorId} connected (${clients.get(creatorId)!.size} clients)`,
    )

    ws.on('close', () => {
      const set = clients.get(creatorId)
      if (set) {
        set.delete(ws)
        if (set.size === 0) clients.delete(creatorId)
      }
      logger.info(`[websocket] creator ${creatorId} disconnected`)
    })

    ws.on('error', (err) => {
      logger.error(
        { err: err instanceof Error ? err : new Error(String(err)) },
        `[websocket] error for creator ${creatorId}`,
      )
    })
  })

  return wss
}

/**
 * Broadcast a notification to all WebSocket clients subscribed for a creator.
 * Silently skips if no clients are connected — delivery failure must not block the pipeline.
 */
export function broadcastInApp(creatorId: string, notification: Notification): void {
  const set = clients.get(creatorId)
  if (!set || set.size === 0) return

  const payload = JSON.stringify(notification)
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload, (err) => {
        if (err)
          logger.error(
            { err: err instanceof Error ? err : new Error(String(err)) },
            `[websocket] send error for creator ${creatorId}`,
          )
      })
    }
  }
}
