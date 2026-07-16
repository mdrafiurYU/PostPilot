import { createLogger, requestIdMiddleware, REQUEST_ID_HEADER } from '@postpilot/logger'
const logger = createLogger('api-gateway')

// API Gateway — Express HTTP server
// Routes client requests to microservices; handles JWT validation and rate limiting.

import http from 'http'
import express, { Express, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { createProxyMiddleware } from 'http-proxy-middleware'
import jwt from 'jsonwebtoken'
import type { IncomingMessage } from 'http'

const app: Express = express()

// ─── Request ID — generate and forward to all downstream services ──────────
// Must be first so all subsequent middleware and proxies see the header.
app.use(requestIdMiddleware(logger))

// ─── Request logging ───────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.log?.info({ method: req.method, url: req.url, creatorId: req.creator?.creator_id }, 'incoming request')
  next()
})

// ─── Service URLs ──────────────────────────────────────────────────────────
const SERVICES = {
  asset: process.env.ASSET_SERVICE_URL ?? 'http://localhost:3001',
  auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3004',
  publishing: process.env.PUBLISHING_SERVICE_URL ?? 'http://localhost:3002',
  analytics: process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3003',
  targeting: process.env.TARGETING_SERVICE_URL ?? 'http://localhost:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3006',
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'postpilot-dev-secret'

// ─── JWT payload shape ─────────────────────────────────────────────────────
interface JwtPayload {
  sub: string        // creator_id
  creator_id: string
  iat?: number
  exp?: number
}

// Extend Express Request to carry the decoded creator
declare global {
  namespace Express {
    interface Request {
      creator?: JwtPayload
    }
  }
}

// ─── JWT validation middleware ─────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.creator = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired JWT' })
  }
}

// ─── Rate limiting (per creator account) ──────────────────────────────────
// Falls back to IP if the JWT hasn't been decoded yet (shouldn't happen on
// protected routes, but keeps the limiter safe).
const creatorRateLimit = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 200,              // 200 requests per creator per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.creator?.creator_id ?? req.ip ?? 'unknown',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' })
  },
})

// ─── Proxy factory ─────────────────────────────────────────────────────────
function proxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      error: (_err, _req, res) => {
        (res as Response).status(502).json({ error: 'Upstream service unavailable' })
      },
    },
  })
}

// ─── WebSocket proxy factory ───────────────────────────────────────────────
function wsProxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
  })
}

// ─── WebSocket JWT validation ──────────────────────────────────────────────
function validateWsToken(req: IncomingMessage): boolean {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    if (!token) return false
    jwt.verify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

// ─── Public routes (no JWT required) ──────────────────────────────────────
// OAuth connect/callback are redirects — the browser follows them directly.
app.use('/auth/:platform/connect', proxy(SERVICES.auth))
app.use('/auth/:platform/callback', proxy(SERVICES.auth))

// Health check — unauthenticated, used by Cloud Run health checks
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', uptime: process.uptime() })
})

// ─── Protected routes ──────────────────────────────────────────────────────
app.use(requireAuth)
app.use(creatorRateLimit)

app.use('/assets', proxy(SERVICES.asset))
app.use('/auth', proxy(SERVICES.auth))
app.use('/channels', proxy(SERVICES.auth))
app.use('/posts', proxy(SERVICES.publishing))
app.use('/batches', proxy(SERVICES.publishing))
app.use('/analytics', proxy(SERVICES.analytics))
app.use('/targeting', proxy(SERVICES.targeting))
app.use('/notifications', proxy(SERVICES.notification))

// ─── 404 fallback ──────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' })
})

// ─── Start server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000

const server = http.createServer(app)

// ─── WebSocket upgrade handlers ────────────────────────────────────────────
// Browsers can't set Authorization headers on WS connections, so JWT is
// passed as ?token=<jwt> query param instead.

const batchWsProxy = wsProxy(SERVICES.publishing)
const notificationWsProxy = wsProxy(SERVICES.notification)

server.on('upgrade', (req, socket, head) => {
  if (!validateWsToken(req)) {
    socket.write('HTTP/1.1 401 Unauthorized')
    socket.destroy()
    return
  }

  const pathname = new URL(req.url ?? '', `http://${req.headers.host}`).pathname

  if (/^\/ws\/batches\/[^/]+$/.test(pathname)) {
    // @ts-expect-error — http-proxy-middleware upgrade handler
    batchWsProxy.upgrade(req, socket, head)
  } else if (pathname === '/ws/notifications') {
    // @ts-expect-error — http-proxy-middleware upgrade handler
    notificationWsProxy.upgrade(req, socket, head)
  } else {
    socket.write('HTTP/1.1 404 Not Found')
    socket.destroy()
  }
})

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`[api-gateway] listening on port ${PORT}`)
  })
}

export { app, server }
