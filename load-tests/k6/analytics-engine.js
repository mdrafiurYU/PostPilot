/**
 * Analytics Engine load test
 *
 * Scenarios:
 *   1. dashboard-aggregation — GET /analytics/dashboard (Req 5.5)
 *   2. post-metrics-read     — GET /analytics/posts/:id/metrics
 *   3. post-insight-read     — GET /analytics/posts/:id/insight
 *   4. recommendation-read   — GET /analytics/channels/:id/recommendation (Req 5.4)
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 * Run: k6 run load-tests/k6/analytics-engine.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { readThresholds } from './lib/thresholds.js'

const BASE_URL = __ENV.ANALYTICS_URL || 'http://localhost:3007'
const VUS      = parseInt(__ENV.VUS  || '20')
const DURATION = __ENV.DURATION      || '30s'

const DATE_RANGES = ['7', '30', '90']

// ─── Custom metrics ───────────────────────────────────────────────────────────

const dashboardDuration = new Trend('analytics_dashboard_ms', true)

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    'dashboard-aggregation': {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'dashboardAggregation',
    },
    'post-metrics-read': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'postMetricsRead',
    },
    'post-insight-read': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'postInsightRead',
    },
    'recommendation-read': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 4)),
      duration: DURATION,
      exec: 'recommendationRead',
    },
  },
  thresholds: {
    ...readThresholds,
    'analytics_dashboard_ms': [
      { threshold: 'p(95)<300', abortOnFail: false },  // aggregation can be slightly heavier
    ],
  },
}

// ─── Scenario: dashboard aggregation (Req 5.5) ───────────────────────────────

export function dashboardAggregation() {
  const creatorId = `creator-load-${__VU}`
  const range     = DATE_RANGES[Math.floor(Math.random() * DATE_RANGES.length)]

  const start = Date.now()
  const res = http.get(
    `${BASE_URL}/analytics/dashboard?creator_id=${creatorId}&range=${range}`
  )
  dashboardDuration.add(Date.now() - start)

  check(res, {
    'dashboard: status 200':          (r) => r.status === 200,
    'dashboard: has creator_id':      (r) => !!JSON.parse(r.body).creator_id,
    'dashboard: has range_days':      (r) => !!JSON.parse(r.body).range_days,
    'dashboard: has aggregate':       (r) => !!JSON.parse(r.body).aggregate,
    'dashboard: valid range value':   (r) => [7, 30, 90].includes(JSON.parse(r.body).range_days),
  })

  sleep(0.1)
}

// ─── Scenario: post metrics read ─────────────────────────────────────────────

export function postMetricsRead() {
  const postId = `post-load-${__VU}-${Math.floor(Math.random() * 200)}`

  const res = http.get(`${BASE_URL}/analytics/posts/${postId}/metrics`)

  check(res, {
    'metrics: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'metrics: response < 200ms':  (r) => r.timings.duration < 200,
  })

  sleep(0.05)
}

// ─── Scenario: post insight read ─────────────────────────────────────────────

export function postInsightRead() {
  const postId = `post-load-${__VU}-${Math.floor(Math.random() * 200)}`

  const res = http.get(`${BASE_URL}/analytics/posts/${postId}/insight`)

  check(res, {
    'insight: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'insight: response < 200ms':  (r) => r.timings.duration < 200,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    // Property 15: exactly 3 factors
    check(res, {
      'insight: exactly 3 factors': () => Array.isArray(body.factors) && body.factors.length === 3,
    })
  }

  sleep(0.05)
}

// ─── Scenario: recommendation read (Req 5.4) ─────────────────────────────────

export function recommendationRead() {
  const channelId = `channel-load-${__VU}`

  const res = http.get(`${BASE_URL}/analytics/channels/${channelId}/recommendation`)

  check(res, {
    'recommendation: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'recommendation: response < 200ms':  (r) => r.timings.duration < 200,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    // Property 16: at most 5 attributes per recommendation
    check(res, {
      'recommendation: ≤5 attributes': () => {
        const attrs = body.recommendation?.attributes || body.recommendation?.content_attributes || []
        return attrs.length <= 5
      },
    })
  }

  sleep(0.1)
}
