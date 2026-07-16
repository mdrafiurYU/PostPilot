/**
 * Publishing Service load test
 *
 * Scenarios:
 *   1. post-scheduling    — POST /posts (scheduling window enforcement, Req 4.1)
 *   2. batch-creation     — POST /batches (batch size enforcement, Req 4.2)
 *   3. post-cancellation  — PATCH /posts/:id action=cancel (Req 4.7)
 *   4. post-read          — GET /posts/:id
 *
 * Requirements: 4.1, 4.2, 4.7
 * Run: k6 run load-tests/k6/publishing-service.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { writeThresholds, readThresholds } from './lib/thresholds.js'

const BASE_URL = __ENV.PUBLISHING_URL || 'http://localhost:3005'
const VUS      = parseInt(__ENV.VUS   || '20')
const DURATION = __ENV.DURATION       || '30s'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const schedulingDuration    = new Trend('post_scheduling_ms', true)
const batchCreationDuration = new Trend('batch_creation_ms', true)
const windowRejectRate      = new Rate('scheduling_window_reject_rate')
const batchRejectRate       = new Rate('batch_size_reject_rate')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function futureDate(offsetDays) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()
}

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    'post-scheduling': {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'postScheduling',
    },
    'batch-creation': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 4)),
      duration: DURATION,
      exec: 'batchCreation',
    },
    'post-cancellation': {
      executor: 'constant-vus',
      vus: 5,
      duration: DURATION,
      exec: 'postCancellation',
      startTime: '5s',
    },
    'post-read': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'postRead',
      startTime: '5s',
    },
  },
  thresholds: {
    ...writeThresholds,
    ...readThresholds,
    'post_scheduling_ms':    [{ threshold: 'p(95)<500',  abortOnFail: false }],
    'batch_creation_ms':     [{ threshold: 'p(95)<500',  abortOnFail: false }],
    // Out-of-window dates must be rejected (Req 4.1)
    'scheduling_window_reject_rate': [{ threshold: 'rate>0.99', abortOnFail: false }],
    // Oversized batches must be rejected (Req 4.2)
    'batch_size_reject_rate': [{ threshold: 'rate>0.99', abortOnFail: false }],
  },
}

// ─── Scenario: post scheduling ────────────────────────────────────────────────

export function postScheduling() {
  // Mix of valid (1–89 days out) and invalid (past / > 90 days) dates
  const validOffsets   = [1, 7, 30, 89]
  const invalidOffsets = [-1, 0, 91, 365]
  const allOffsets     = [...validOffsets, ...invalidOffsets]
  const offsetDays     = allOffsets[Math.floor(Math.random() * allOffsets.length)]
  const isValid        = validOffsets.includes(offsetDays)

  const payload = JSON.stringify({
    creator_id:   `creator-load-${__VU}`,
    channel_id:   `channel-load-${__VU}`,
    scheduled_at: futureDate(offsetDays),
  })

  const start = Date.now()
  const res = http.post(`${BASE_URL}/posts`, payload, {
    headers: { 'Content-Type': 'application/json' },
  })
  schedulingDuration.add(Date.now() - start)

  if (isValid) {
    check(res, {
      'valid schedule: status 201':        (r) => r.status === 201,
      'valid schedule: has post.id':       (r) => !!JSON.parse(r.body).id,
      'valid schedule: status=scheduled':  (r) => JSON.parse(r.body).status === 'scheduled',
    })
  } else {
    const rejected = check(res, {
      'invalid schedule: status 422': (r) => r.status === 422,
    })
    windowRejectRate.add(rejected)
  }

  sleep(0.1)
}

// ─── Scenario: batch creation ─────────────────────────────────────────────────

export function batchCreation() {
  // Mix of valid (1–50 posts) and invalid (0 or > 50) batch sizes
  const validSizes   = [1, 10, 25, 50]
  const invalidSizes = [0, 51, 100]
  const allSizes     = [...validSizes, ...invalidSizes]
  const size         = allSizes[Math.floor(Math.random() * allSizes.length)]
  const isValid      = validSizes.includes(size)

  const postIds = Array.from({ length: size }, (_, i) => `post-load-${__VU}-${i}`)

  const payload = JSON.stringify({
    creator_id: `creator-load-${__VU}`,
    name:       `Load Test Batch ${__VU}-${Date.now()}`,
    post_ids:   postIds,
  })

  const start = Date.now()
  const res = http.post(`${BASE_URL}/batches`, payload, {
    headers: { 'Content-Type': 'application/json' },
  })
  batchCreationDuration.add(Date.now() - start)

  if (isValid) {
    check(res, {
      'valid batch: status 201':       (r) => r.status === 201,
      'valid batch: has batch.id':     (r) => !!JSON.parse(r.body).id,
      'valid batch: status=scheduled': (r) => JSON.parse(r.body).status === 'scheduled',
    })
  } else {
    const rejected = check(res, {
      'invalid batch: status 422': (r) => r.status === 422,
    })
    batchRejectRate.add(rejected)
  }

  sleep(0.2)
}

// ─── Scenario: post cancellation ─────────────────────────────────────────────

export function setup() {
  // Create a pool of posts to cancel during the test
  const postIds = []
  for (let i = 0; i < 50; i++) {
    const res = http.post(
      `${BASE_URL}/posts`,
      JSON.stringify({
        creator_id:   'creator-cancel-seed',
        channel_id:   'channel-cancel-seed',
        scheduled_at: futureDate(7),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (res.status === 201) {
      postIds.push(JSON.parse(res.body).id)
    }
  }
  return { postIds }
}

export function postCancellation(data) {
  const postIds = data?.postIds || []
  if (postIds.length === 0) { sleep(1); return }

  const postId = postIds[Math.floor(Math.random() * postIds.length)]

  const res = http.patch(
    `${BASE_URL}/posts/${postId}`,
    JSON.stringify({ action: 'cancel' }),
    { headers: { 'Content-Type': 'application/json' } }
  )

  check(res, {
    'cancel: status 200 or 409': (r) => r.status === 200 || r.status === 409,
  })

  sleep(0.1)
}

// ─── Scenario: post read ──────────────────────────────────────────────────────

export function postRead(data) {
  const postIds = data?.postIds || []
  const postId  = postIds.length > 0
    ? postIds[Math.floor(Math.random() * postIds.length)]
    : `post-nonexistent-${__VU}`

  const res = http.get(`${BASE_URL}/posts/${postId}`)

  check(res, {
    'post read: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'post read: response < 200ms':  (r) => r.timings.duration < 200,
  })

  sleep(0.05)
}
