/**
 * Targeting Engine load test
 *
 * Scenarios:
 *   1. hashtag-suggestions   — GET /targeting/hashtags (Req 3.1, 3.2)
 *   2. timing-recommendations — GET /targeting/timing (Req 3.3)
 *   3. trend-analysis        — GET /targeting/trends (Req 3.4)
 *   4. performance-prediction — GET /targeting/prediction (Req 3.5, 3.6)
 *
 * Requirements: 3.1–3.6
 * Run: k6 run load-tests/k6/targeting-engine.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'
import { readThresholds } from './lib/thresholds.js'

const BASE_URL = __ENV.TARGETING_URL || 'http://localhost:3006'
const VUS      = parseInt(__ENV.VUS  || '20')
const DURATION = __ENV.DURATION      || '30s'

const PLATFORMS   = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']
const CATEGORIES  = ['fitness', 'cooking', 'tech', 'travel', 'fashion', 'gaming']

// ─── Custom metrics ───────────────────────────────────────────────────────────

const hashtagCountValid    = new Rate('hashtag_count_valid')      // 5–30 entries
const hashtagSortedValid   = new Rate('hashtag_sorted_valid')     // sorted by score desc
const timingCountValid     = new Rate('timing_count_valid')       // exactly 3 slots
const trendCountValid      = new Rate('trend_count_valid')        // exactly 10 entries
const predictionRangeValid = new Rate('prediction_range_valid')   // low <= high

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    'hashtag-suggestions': {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'hashtagSuggestions',
    },
    'timing-recommendations': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'timingRecommendations',
    },
    'trend-analysis': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'trendAnalysis',
    },
    'performance-prediction': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 4)),
      duration: DURATION,
      exec: 'performancePrediction',
    },
  },
  thresholds: {
    ...readThresholds,
    // Structural correctness under load (Properties 5, 6, 7, 8)
    'hashtag_count_valid':    [{ threshold: 'rate>0.99', abortOnFail: false }],
    'hashtag_sorted_valid':   [{ threshold: 'rate>0.99', abortOnFail: false }],
    'timing_count_valid':     [{ threshold: 'rate>0.99', abortOnFail: false }],
    'trend_count_valid':      [{ threshold: 'rate>0.99', abortOnFail: false }],
    'prediction_range_valid': [{ threshold: 'rate>0.99', abortOnFail: false }],
  },
}

// ─── Scenario: hashtag suggestions (Property 5) ───────────────────────────────

export function hashtagSuggestions() {
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]
  const postId   = `post-load-${__VU}-${Math.floor(Math.random() * 100)}`

  const res = http.get(
    `${BASE_URL}/targeting/hashtags?post_id=${postId}&platform=${platform}`
  )

  check(res, {
    'hashtags: status 200': (r) => r.status === 200,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    const hashtags = body.hashtags || []

    // Property 5: count ∈ [5, 30]
    const countOk = hashtags.length >= 5 && hashtags.length <= 30
    hashtagCountValid.add(countOk)

    // Property 5: sorted by predicted_reach_score descending
    let sortedOk = true
    for (let i = 1; i < hashtags.length; i++) {
      if (hashtags[i].predicted_reach_score > hashtags[i - 1].predicted_reach_score) {
        sortedOk = false
        break
      }
    }
    hashtagSortedValid.add(sortedOk)

    check(res, {
      'hashtags: count in [5,30]':   () => countOk,
      'hashtags: sorted desc':       () => sortedOk,
      'hashtags: valid volume_tier': () => hashtags.every(
        (h) => ['high', 'mid', 'niche'].includes(h.volume_tier)
      ),
    })
  }

  sleep(0.05)
}

// ─── Scenario: timing recommendations (Property 6) ───────────────────────────

export function timingRecommendations() {
  const channelId = `channel-load-${__VU}`

  const res = http.get(`${BASE_URL}/targeting/timing?channel_id=${channelId}`)

  check(res, {
    'timing: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    const slots = body.timing || []
    const now   = Date.now()
    const in7d  = now + 7 * 24 * 60 * 60 * 1000

    // Property 6: exactly 3 slots
    const countOk = slots.length === 3
    timingCountValid.add(countOk)

    // Property 6: all within next 7 days
    const withinWindow = slots.every((s) => {
      const t = new Date(s.recommended_at || s.slot).getTime()
      return t >= now && t <= in7d
    })

    check(res, {
      'timing: exactly 3 slots':      () => countOk,
      'timing: all within 7 days':    () => withinWindow,
    })
  }

  sleep(0.1)
}

// ─── Scenario: trend analysis (Property 7) ───────────────────────────────────

export function trendAnalysis() {
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]

  const res = http.get(
    `${BASE_URL}/targeting/trends?platform=${platform}&category=${category}`
  )

  check(res, {
    'trends: status 200': (r) => r.status === 200,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    const trends = body.trends || []

    // Property 7: exactly 10 entries
    const countOk = trends.length === 10
    trendCountValid.add(countOk)

    check(res, {
      'trends: exactly 10 entries': () => countOk,
    })
  }

  sleep(0.05)
}

// ─── Scenario: performance prediction (Properties 8, 9) ──────────────────────

export function performancePrediction() {
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]
  const postId   = `post-load-${__VU}-${Math.floor(Math.random() * 100)}`

  const res = http.get(
    `${BASE_URL}/targeting/prediction?post_id=${postId}&platform=${platform}`
  )

  check(res, {
    'prediction: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  })

  if (res.status === 200) {
    let body
    try { body = JSON.parse(res.body) } catch { return }

    // Property 8: low <= high
    const rangeOk = body.estimated_engagement_rate_low <= body.estimated_engagement_rate_high
    predictionRangeValid.add(rangeOk)

    check(res, {
      'prediction: low <= high':          () => rangeOk,
      'prediction: valid confidence':     () => ['low', 'medium', 'high'].includes(body.confidence),
      'prediction: valid data_source':    () =>
        ['channel_history', 'platform_benchmarks'].includes(body.data_source),
    })
  }

  sleep(0.1)
}
