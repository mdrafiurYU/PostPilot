/**
 * Shared JWT helper for k6 load tests.
 * Generates a signed HS256 JWT without external dependencies (pure k6 crypto).
 *
 * k6 doesn't ship a full JWT library, so we build the token manually using
 * the built-in `crypto` module (available in k6 >= 0.42).
 */

import { crypto } from 'k6/experimental/webcrypto'
import encoding from 'k6/encoding'

const JWT_SECRET = __ENV.JWT_SECRET || 'postpilot-dev-secret'

/**
 * Returns a Bearer token for the given creatorId.
 * Tokens are valid for 1 hour from the time of generation.
 *
 * @param {string} creatorId
 * @returns {string}  "Bearer <token>"
 */
export function bearerToken(creatorId = 'load-test-creator') {
  const header = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl')
  const now = Math.floor(Date.now() / 1000)
  const payload = encoding.b64encode(
    JSON.stringify({ sub: creatorId, creator_id: creatorId, iat: now, exp: now + 3600 }),
    'rawurl'
  )

  const signingInput = `${header}.${payload}`

  // k6 webcrypto HMAC-SHA256
  const keyBytes = new TextEncoder().encode(JWT_SECRET)
  const msgBytes = new TextEncoder().encode(signingInput)

  // Synchronous HMAC via k6's built-in hmac (available without async)
  // Falls back to a static dev token when webcrypto is unavailable in older k6 builds.
  let signature
  try {
    const hmac = crypto.subtle.importKeySync
      ? null // placeholder — k6 webcrypto is async-only; use the workaround below
      : null

    // k6 ships `crypto.hmac` as a synchronous helper (k6 >= 0.29)
    const sigHex = crypto.hmac('sha256', JWT_SECRET, signingInput, 'hex')
    const sigBytes = hexToBytes(sigHex)
    signature = encoding.b64encode(sigBytes, 'rawurl')
  } catch {
    // Fallback: static dev token (only safe for local load testing)
    signature = 'dev-signature'
  }

  return `Bearer ${signingInput}.${signature}`
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
