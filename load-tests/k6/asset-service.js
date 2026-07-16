/**
 * Asset Service load test
 *
 * Scenarios:
 *   1. upload-initiation  — POST /assets (validation + presigned URL generation)
 *   2. asset-read         — GET /assets/:id (metadata fetch)
 *   3. upload-rejection   — POST /assets with invalid inputs (must return 422)
 *
 * Requirements: 1.1, 1.2, 1.6
 * Run: k6 run load-tests/k6/asset-service.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { writeThresholds, readThresholds } from './lib/thresholds.js'

const BASE_URL = __ENV.ASSET_URL || 'http://localhost:3001'
const VUS      = parseInt(__ENV.VUS      || '20')
const DURATION = __ENV.DURATION          || '30s'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const uploadInitiationDuration = new Trend('asset_upload_initiation_ms', true)
const rejectionRate            = new Rate('asset_upload_rejection_rate')
const validAcceptRate          = new Rate('asset_upload_accept_rate')

// ─── Shared test data ─────────────────────────────────────────────────────────

const VALID_VIDEOS = [
  { filename: 'clip.mp4',  file_size_bytes: 100_000_000 },  // 100 MB
  { filename: 'raw.mov',   file_size_bytes: 500_000_000 },  // 500 MB
  { filename: 'screen.webm', file_size_bytes: 1_000_000 },  // 1 MB
]

const VALID_IMAGES = [
  { filename: 'thumb.jpeg', file_size_bytes: 1_000_000 },   // 1 MB
  { filename: 'cover.png',  file_size_bytes: 50_000_000 },  // 50 MB
  { filename: 'anim.gif',   file_size_bytes: 10_000_000 },  // 10 MB
]

const INVALID_UPLOADS = [
  // Wrong format
  { filename: 'doc.pdf',   file_size_bytes: 1_000_000,       reason: 'invalid format' },
  // Video too large (> 10 GB)
  { filename: 'huge.mp4',  file_size_bytes: 11_000_000_000,  reason: 'video too large' },
  // Image too large (> 500 MB)
  { filename: 'big.jpeg',  file_size_bytes: 600_000_000,     reason: 'image too large' },
  // Missing filename
  { filename: '',          file_size_bytes: 1_000_000,       reason: 'missing filename' },
]

// ─── Scenario config ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    'upload-initiation': {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'uploadInitiation',
    },
    'asset-read': {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: 'assetRead',
      startTime: '5s',  // let uploads create some assets first
    },
    'upload-rejection': {
      executor: 'constant-vus',
      vus: 5,
      duration: DURATION,
      exec: 'uploadRejection',
    },
  },
  thresholds: {
    ...writeThresholds,
    ...readThresholds,
    'asset_upload_initiation_ms': [
      { threshold: 'p(95)<500', abortOnFail: false },
    ],
    // All invalid uploads must be rejected (Req 1.6)
    'asset_upload_rejection_rate': [
      { threshold: 'rate>0.99', abortOnFail: false },
    ],
    // All valid uploads must be accepted
    'asset_upload_accept_rate': [
      { threshold: 'rate>0.99', abortOnFail: false },
    ],
  },
}

// ─── Scenario: upload initiation ─────────────────────────────────────────────

export function uploadInitiation() {
  const all = [...VALID_VIDEOS, ...VALID_IMAGES]
  const item = all[Math.floor(Math.random() * all.length)]

  const payload = JSON.stringify({
    filename: item.filename,
    file_size_bytes: item.file_size_bytes,
    creator_id: `creator-load-${__VU}`,
  })

  const start = Date.now()
  const res = http.post(`${BASE_URL}/assets`, payload, {
    headers: { 'Content-Type': 'application/json' },
  })
  uploadInitiationDuration.add(Date.now() - start)

  const ok = check(res, {
    'upload initiation: status 201':       (r) => r.status === 201,
    'upload initiation: has uploadUrl':    (r) => !!JSON.parse(r.body).uploadUrl,
    'upload initiation: has asset.id':     (r) => !!JSON.parse(r.body).asset?.id,
    'upload initiation: status uploading': (r) => JSON.parse(r.body).asset?.status === 'uploading',
  })

  validAcceptRate.add(ok)
  sleep(0.1)
}

// ─── Scenario: asset read ─────────────────────────────────────────────────────

// Seed a known asset ID by doing one upload at setup time
let seededAssetId = 'asset-load-seed'

export function setup() {
  const res = http.post(
    `${BASE_URL}/assets`,
    JSON.stringify({ filename: 'seed.mp4', file_size_bytes: 1_000_000, creator_id: 'creator-seed' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  if (res.status === 201) {
    seededAssetId = JSON.parse(res.body).asset?.id || seededAssetId
  }
  return { assetId: seededAssetId }
}

export function assetRead(data) {
  const assetId = data?.assetId || seededAssetId

  const res = http.get(`${BASE_URL}/assets/${assetId}`)

  check(res, {
    'asset read: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'asset read: response time < 200ms': (r) => r.timings.duration < 200,
  })

  sleep(0.05)
}

// ─── Scenario: upload rejection (Req 1.6) ────────────────────────────────────

export function uploadRejection() {
  const item = INVALID_UPLOADS[Math.floor(Math.random() * INVALID_UPLOADS.length)]

  const payload = JSON.stringify({
    filename: item.filename,
    file_size_bytes: item.file_size_bytes,
    creator_id: `creator-load-${__VU}`,
  })

  const res = http.post(`${BASE_URL}/assets`, payload, {
    headers: { 'Content-Type': 'application/json' },
  })

  const rejected = check(res, {
    [`upload rejection (${item.reason}): status 422`]: (r) => r.status === 422,
    [`upload rejection (${item.reason}): has errors`]: (r) => {
      try { return Array.isArray(JSON.parse(r.body).errors) } catch { return false }
    },
  })

  rejectionRate.add(rejected)
  sleep(0.1)
}
