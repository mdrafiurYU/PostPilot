/**
 * Soak test — sustained load across all services for 10 minutes.
 *
 * Validates that the system remains stable under continuous load:
 * - No memory leaks causing latency degradation over time
 * - Error rate stays below 1% throughout
 * - p95 latency stays within bounds for the full duration
 *
 * Run: k6 run load-tests/k6/soak.js
 * (Override duration: k6 run --env DURATION=30m load-tests/k6/soak.js)
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'
import encoding from 'k6/encoding'
import { crypto } from 'k6/experimental/webcrypto'

const ASSET_URL      = __ENV.ASSET_URL      || 'http://localhost:3001'
const PUBLISHING_URL = __ENV.PUBLISHING_URL || 'http://localhost:3005'
const TARGETING_URL  = __ENV.TARGETING_URL  || 'http://localhost:3006'
const ANALYTICS_URL  = __ENV.ANALYTICS_URL  || 'http://localhost:3007'
const GATEWAY_URL    = __ENV.BASE_URL       || 'http://localhost:3000'
const JWT_SECRET     = __ENV.JWT_SECRET     || 'postpilot-dev-secret'
const DURATION       = __ENV.DURATION       || '10m'
const VUS            = parseInt(__ENV.VUS   || '10')

// ─── JWT helper ───────────────────────────────────────────────────────────────

function makeJwt(creatorId) {
  const header  = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl')
  const now     = Math.floor(Date.now() / 1000)
  const payload = encoding.b64encode(
    JSON.stringify({ sub: creatorId, creator_id: creatorId, iat: now, exp: now + 7200 }),
    'rawurl'
  )
  const signingInput = `${header}.${payload}`
  let sig
  try {
    const sigHex = crypto.hmac('sha256', JWT_SECRET, signingInput, 'hex')
    const bytes  = new Uint8Array(sigHex.length / 2)
    for (let i = 0; i < sigHex.length; i += 2) bytes[i / 2] = parseInt(sigHex.slice(i, i + 2), 16)
    sig = encoding.b64encode(bytes, 'rawurl')
  } catch { sig = 'dev-sig' }
  return `Bearer ${signingInput}.${sig}`
}

// ─── Custom metrics ───────────────────────────────────────────────────────────

const soakErrorRate = new Rate('soak_error_rate')
const soakLatency   = new Trend('soak_latency_ms', true)

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: VUS },      // ramp up
        { duration: DURATION, target: VUS },   // sustained load
        { duration: '1m',  target: 0 },        // ramp down
      ],
      exec: 'soakIteration',
    },
  },
  thresholds: {
    'http_req_failed':   [{ threshold: 'rate<0.01',  abortOnFail: false }],
    'http_req_duration': [
      { threshold: 'p(95)<500',  abortOnFail: false },
      { threshold: 'p(99)<1000', abortOnFail: false },
    ],
    'soak_error_rate':   [{ threshold: 'rate<0.01',  abortOnFail: false }],
    'soak_latency_ms':   [{ threshold: 'p(95)<500',  abortOnFail: false }],
  },
}

// ─── Mixed workload ───────────────────────────────────────────────────────────

const PLATFORMS  = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']
const CATEGORIES = ['fitness', 'cooking', 'tech', 'travel', 'fashion']

export function soakIteration() {
  const creatorId = `soak-creator-${__VU}`
  const token     = makeJwt(creatorId)
  const authHdr   = { Authorization: token }

  // Randomly pick one of 6 workload types per iteration
  const workload = Math.floor(Math.random() * 6)

  let res
  const start = Date.now()

  switch (workload) {
    case 0: {
      // Asset upload initiation
      res = http.post(
        `${ASSET_URL}/assets`,
        JSON.stringify({ filename: 'soak.mp4', file_size_bytes: 50_000_000, creator_id: creatorId }),
        { headers: { 'Content-Type': 'application/json' } }
      )
      check(res, { 'soak asset upload: 201 or 422': (r) => r.status === 201 || r.status === 422 })
      break
    }
    case 1: {
      // Post scheduling
      const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      res = http.post(
        `${PUBLISHING_URL}/posts`,
        JSON.stringify({ creator_id: creatorId, channel_id: `channel-${__VU}`, scheduled_at: scheduledAt }),
        { headers: { 'Content-Type': 'application/json' } }
      )
      check(res, { 'soak post schedule: 201': (r) => r.status === 201 })
      break
    }
    case 2: {
      // Hashtag suggestions
      const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]
      res = http.get(`${TARGETING_URL}/targeting/hashtags?post_id=soak-post-${__VU}&platform=${platform}`)
      check(res, { 'soak hashtags: 200': (r) => r.status === 200 })
      break
    }
    case 3: {
      // Trend analysis
      const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]
      const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]
      res = http.get(`${TARGETING_URL}/targeting/trends?platform=${platform}&category=${category}`)
      check(res, { 'soak trends: 200': (r) => r.status === 200 })
      break
    }
    case 4: {
      // Analytics dashboard
      const range = ['7', '30', '90'][Math.floor(Math.random() * 3)]
      res = http.get(`${ANALYTICS_URL}/analytics/dashboard?creator_id=${creatorId}&range=${range}`)
      check(res, { 'soak dashboard: 200': (r) => r.status === 200 })
      break
    }
    case 5: {
      // API Gateway authenticated read
      res = http.get(`${GATEWAY_URL}/targeting/trends?platform=tiktok&category=fitness`, { headers: authHdr })
      check(res, { 'soak gateway: not 401/502': (r) => r.status !== 401 && r.status !== 502 })
      break
    }
  }

  const elapsed = Date.now() - start
  soakLatency.add(elapsed)

  const isError = res && (res.status >= 500 || res.status === 0)
  soakErrorRate.add(isError ? 1 : 0)

  sleep(0.2 + Math.random() * 0.3)  // 200–500 ms think time
}
