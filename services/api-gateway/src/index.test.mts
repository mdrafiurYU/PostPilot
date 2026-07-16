// API Gateway — unit tests for JWT auth, rate limiting, and WebSocket gateway

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import http from 'http'
import net from 'net'

// Mock http-proxy-middleware before importing the app so no real proxying happens
vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => {
    const middleware = (_req: any, res: any) => {
      res.status(200).json({ proxied: true })
    }
    // Provide a no-op upgrade handler so wsProxy instances don't throw
    middleware.upgrade = (_req: any, socket: any, _head: any) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
      socket.destroy()
    }
    return middleware
  },
}))

const JWT_SECRET = 'postpilot-dev-secret'

function makeToken(payload: object = { sub: 'creator-1', creator_id: 'creator-1' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

// Import app after mocks are set up
const { app, server } = await import('./index.js')

afterAll(() => {
  server.close()
})

describe('API Gateway — auth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/assets')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/missing/i)
  })

  it('returns 401 when token is malformed', async () => {
    const res = await request(app).get('/assets').set('Authorization', 'Bearer not-a-jwt')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid/i)
  })

  it('returns 401 when token is signed with wrong secret', async () => {
    const badToken = jwt.sign({ sub: 'x', creator_id: 'x' }, 'wrong-secret')
    const res = await request(app).get('/assets').set('Authorization', `Bearer ${badToken}`)
    expect(res.status).toBe(401)
  })

  it('proxies request when valid JWT is provided', async () => {
    const token = makeToken()
    const res = await request(app).get('/assets').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.proxied).toBe(true)
  })

  it('allows /auth/:platform/connect without a token', async () => {
    const res = await request(app).get('/auth/tiktok/connect')
    // Proxy mock returns 200 — no 401
    expect(res.status).toBe(200)
  })

  it('allows /auth/:platform/callback without a token', async () => {
    const res = await request(app).get('/auth/tiktok/callback')
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown routes', async () => {
    const token = makeToken()
    const res = await request(app).get('/unknown-route').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('API Gateway — route proxying', () => {
  const token = makeToken()

  const protectedRoutes = [
    '/assets',
    '/auth/me',
    '/channels',
    '/posts',
    '/batches',
    '/analytics',
    '/targeting',
    '/notifications',
  ]

  for (const route of protectedRoutes) {
    it(`proxies ${route} with valid JWT`, async () => {
      const res = await request(app).get(route).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.proxied).toBe(true)
    })
  }
})

describe('API Gateway — WebSocket upgrade', () => {
  const JWT_SECRET = 'postpilot-dev-secret'

  function makeToken(payload: object = { sub: 'creator-1', creator_id: 'creator-1' }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
  }

  /** Send a raw HTTP upgrade request and return the response status line */
  function sendUpgrade(path: string): Promise<string> {
    return new Promise((resolve) => {
      // Ensure the server is listening on an ephemeral port
      if (!server.listening) {
        server.listen(0)
      }
      const addr = server.address() as net.AddressInfo
      const socket = net.createConnection(addr.port, '127.0.0.1')
      let response = ''
      socket.on('data', (chunk) => {
        response += chunk.toString()
        socket.destroy()
      })
      socket.on('close', () => resolve(response))
      socket.on('error', () => resolve(response))
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${addr.port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `\r\n`
      )
    })
  }

  it('rejects WS upgrade without token with 401', async () => {
    const response = await sendUpgrade('/ws/notifications')
    expect(response).toMatch(/401/)
  })

  it('rejects WS upgrade with invalid token with 401', async () => {
    const response = await sendUpgrade('/ws/notifications?token=bad-token')
    expect(response).toMatch(/401/)
  })

  it('rejects WS upgrade to unknown path with 404', async () => {
    const token = makeToken()
    const response = await sendUpgrade(`/ws/unknown?token=${token}`)
    expect(response).toMatch(/404/)
  })

  it('accepts WS upgrade to /ws/notifications with valid token', async () => {
    const token = makeToken()
    const response = await sendUpgrade(`/ws/notifications?token=${token}`)
    // Mock upgrade handler writes 101 Switching Protocols
    expect(response).toMatch(/101/)
  })

  it('accepts WS upgrade to /ws/batches/:batchId with valid token', async () => {
    const token = makeToken()
    const response = await sendUpgrade(`/ws/batches/batch-123?token=${token}`)
    expect(response).toMatch(/101/)
  })
})
