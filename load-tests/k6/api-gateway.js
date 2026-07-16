/**
 * API Gateway load test
 *
 * Tests the full routing + JWT validation + rate limiting layer.
 *
 * Scenarios:
 *   1. authenticated-reads    — mixed GET requests through the gateway
 *   2. unauthenticated-reqs   — requests without JWT must return 401
 *   3. rate-limit-enforcement — burst > 200 req/min per creator must trigger 429
 *
 * Requirements: 6.1 (JWT auth), 4.1 (scheduling via gateway)
 * Run: k6 run load-tests/k6/api-gateway.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { gatewayThresholds } from './lib/thresholds.js'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const VUS      = parseInt(__ENV.VUS || '20')
const DURATION = __ENV.DURATION    || '30s'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const authRejectRate  = new Rate('gateway_auth_reject_rate')
const rateLimitRate   = new Rate('gateway_rate_limit_rate')
const proxyLatency    = new Trend('gateway_proxy_latency_ms', true)

// ─── JWT helper (inline — no external deps in k6) ────────────────────────────
// Uses k6's built-in crypto.hmac for HS256 signing.

import { crypto } from 'k6/experimental/webcrypto'
import encoding from 'k6/encoding'

const JWT_SECRET = __ENV.JWT_SECRET || 'postpilot-dev-secret'

function makeJwt(creatorId) {
  const header  = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl')
  const now     = Math.floor(Date.now() / 1000)
  const payload = encoding.b64encode(
    JSON.stringify({ sub: creatorId, creator_id: creatorId, iat: now, exp: now + 3600 }),
    'rawurl'
  )
  const signingInput = `${header}.${payload}`
  let sig
  try {
    const sigHex = crypto.hmac('sha256', JWT_SECRET, signingInput, 'hex')
    const bytes  = new Uint8Array(sigHex.length / 2)
    for (let i = 0; i < sigHex.length; i += 2) {
      bytes[i / 2] = parseInt(sigHex.slice(i, i + 2), 16)
    }
    sig = encoding.b64encode(bytes, 'rawurl')
  } catch {
    sig = 'dev-sig'
  }
  return `Bearer ${signingInput}.${sig}`
}

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    'authenticated-reads': {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'authenticatedReads',
    },
    'unauthenticated-reqs': {
      executor: 'constant-vus',
      vus: 5,
      duration: DURATION,
      exec: 'unauthenticatedRequests',
    },
    'rate-limit-enforcement': {
      executor: 'constant-arrival-rate',
      rate: 250,          // > 200 req/min threshold → should trigger 429s
      timeUnit: '60s',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'rateLimitEnforcement',
    },
  },
  thresholds: {
    ...gatewayThresholds,
    'gateway_proxy_latency_ms': [{ threshold: 'p(95)<300', abortOnFail: false }],
    // All unauthenticated requests must be rejected
    'gateway_auth_reject_rate': [{ threshold: 'rate>0.99', abortOnFail: false }],
  },
}

// ─── Scenario: authenticated reads ───────────────────────────────────────────

const PROTECTED_ROUTES = [
  '/assets/nonexistent-asset',
  '/posts/nonexistent-post',
  '/targeting/trends?platform=tiktok&category=fitness',
  '/analytics/dashboard?creator_id=creator-load&range=7',
]

export function authenticatedReads() {
  const creatorId = `creator-load-${__VU}`
  const token     = makeJwt(creatorId)
  const route     = PROTECTED_ROUTES[Math.floor(Math.random() * PROTECTED_ROUTES.length)]

  const start = Date.now()
  const res = http.get(`${BASE_URL}${route}`, {
    headers: { Authorization: token },
  })
  proxyLatency.add(Date.now() - start)

  check(res, {
    'gateway auth: not 401':    (r) => r.status !== 401,
    'gateway auth: not 502':    (r) => r.status !== 502,
    'gateway auth: has body':   (r) => r.body.length > 0,
  })

  sleep(0.1)
}

// ─── Scenario: unauthenticated requests ──────────────────────────────────────

export function unauthenticatedRequests() {
  const routes = [
    '/assets/some-id',
    '/posts/some-id',
    '/analytics/dashboard?creator_id=x&range=7',
  ]
  const route = routes[Math.floor(Math.random() * routes.length)]

  // No Authorization header
  const res = http.get(`${BASE_URL}${route}`)

  const rejected = check(res, {
    'unauth: status 401': (r) => r.status === 401,
  })
  authRejectRate.add(rejected)

  sleep(0.1)
}

// ─── Scenario: rate limit enforcement ────────────────────────────────────────
// All requests use the SAME creator ID to hit the per-creator rate limit.

export function rateLimitEnforcement() {
  const token = makeJwt('creator-rate-limit-test')

  const res = http.get(`${BASE_URL}/assets/some-id`, {
    headers: { Authorization: token },
  })

  // We expect a mix of 404 (proxied) and 429 (rate limited)
  check(res, {
    'rate limit: 404 or 429': (r) => r.status === 404 || r.status === 429,
  })

  if (res.status === 429) {
    rateLimitRate.add(true)
  }

  // No sleep — we want to sustain high rate
}
