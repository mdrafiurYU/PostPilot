// @postpilot/logger — shared structured JSON logger
//
// Wraps pino with PostPilot-specific defaults:
//   - JSON output in production, pretty-print in development
//   - LOG_LEVEL env var controls verbosity (default: 'info')
//   - createLogger(service) binds the service name to every log line
//   - child(bindings) creates a child logger with additional context
//     (e.g. { eventId, assetId, creatorId } for pipeline tracing)
//
// Usage:
//   import { createLogger } from '@postpilot/logger'
//   const logger = createLogger('compression-engine')
//   logger.info({ assetId, creatorId }, 'processing asset.uploaded')
//   logger.error({ err, assetId }, 'encoding failed')

import pino, { type Logger, type LoggerOptions } from 'pino'
import type { Request, Response, NextFunction } from 'express'

export type { Logger }

const isDev = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as Record<string, unknown>).__vitest_worker__ !== 'undefined'
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info')

const baseOptions: LoggerOptions = {
  level,
  // In development (not test), use pino-pretty for human-readable output.
  // In production, emit raw JSON. In test, suppress all output.
  transport: isDev && !isTest
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
    : undefined,
  formatters: {
    // Rename pino's 'level' number to a human-readable string in JSON output
    level(label) {
      return { level: label }
    },
  },
  // Include timestamp as ISO string
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields that should never appear in logs
  redact: {
    paths: ['*.access_token', '*.refresh_token', '*.password', '*.secret', '*.authorization'],
    censor: '[REDACTED]',
  },
}

/**
 * Create a logger bound to a specific service name.
 * All log lines will include `{ service: '<name>' }`.
 */
export function createLogger(service: string): Logger {
  return pino(baseOptions).child({ service })
}

/**
 * Default logger for cases where a service name isn't available at import time.
 * Prefer createLogger() in service entry points.
 */
export const logger = pino(baseOptions)

// ─── Request correlation middleware ──────────────────────────────────────────

export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Express middleware that ensures every request has an X-Request-ID header.
 *
 * - If the incoming request already has X-Request-ID (forwarded by the API
 *   gateway), it is preserved.
 * - If not, a new UUID is generated.
 *
 * The request ID is:
 *   1. Echoed back in the response header so clients can correlate responses.
 *   2. Attached to `req.requestId` for use in route handlers.
 *   3. Bound to a child logger available as `req.log` for structured logging.
 *
 * Usage in a service:
 *   import { requestIdMiddleware } from '@postpilot/logger'
 *   app.use(requestIdMiddleware(serviceLogger))
 *
 *   // In a route handler:
 *   app.get('/assets/:id', (req, res) => {
 *     req.log.info({ assetId: req.params.id }, 'fetching asset')
 *   })
 */
export function requestIdMiddleware(serviceLogger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? crypto.randomUUID()

    // Attach to request object for use in handlers
    ;(req as Request & { requestId: string }).requestId = requestId

    // Echo back in response
    res.setHeader(REQUEST_ID_HEADER, requestId)

    // Bind to a child logger — all logs from this request carry requestId
    ;(req as Request & { log: Logger }).log = serviceLogger.child({ requestId })

    next()
  }
}

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      requestId?: string
      log?: Logger
    }
  }
}
