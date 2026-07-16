import { createLogger } from '@postpilot/logger'
const logger = createLogger('auth-service')

// OAuth CSRF state store — Redis (production) or in-memory (dev/test)
//
// The state parameter is a random UUID generated during /connect and validated
// during /callback to prevent CSRF attacks.
//
// With multiple auth-service replicas, the /callback request may land on a
// different pod than the one that stored the state. Redis solves this by
// providing a shared, TTL-backed store across all replicas.
//
// Set OAUTH_STATE_PROVIDER=redis to use Redis (requires REDIS_URL).
// Defaults to in-memory when unset (safe for single-replica dev/test).

import Redis from 'ioredis'
import type { Platform } from '@postpilot/types'

export interface OAuthStateData {
  creatorId: string
  platform: Platform
}

const STATE_TTL_SECONDS = 5 * 60 // 5 minutes — enough for any OAuth flow

// ─── Redis implementation ─────────────────────────────────────────────────────

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    redisClient = new Redis(url, { lazyConnect: true })
    redisClient.on('error', (err) => {
      logger.error({ err }, '[oauthStateStore] Redis error')
    })
  }
  return redisClient
}

function stateKey(state: string): string {
  return `oauth:state:${state}`
}

async function redisSet(state: string, data: OAuthStateData): Promise<void> {
  await getRedis().set(stateKey(state), JSON.stringify(data), 'EX', STATE_TTL_SECONDS)
}

async function redisGet(state: string): Promise<OAuthStateData | null> {
  const raw = await getRedis().get(stateKey(state))
  if (!raw) return null
  return JSON.parse(raw) as OAuthStateData
}

async function redisDel(state: string): Promise<void> {
  await getRedis().del(stateKey(state))
}

// ─── In-memory fallback (dev / test) ─────────────────────────────────────────

const memStore = new Map<string, { data: OAuthStateData; expiresAt: number }>()

function memSet(state: string, data: OAuthStateData): void {
  memStore.set(state, { data, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 })
}

function memGet(state: string): OAuthStateData | null {
  const entry = memStore.get(state)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memStore.delete(state)
    return null
  }
  return entry.data
}

function memDel(state: string): void {
  memStore.delete(state)
}

// ─── Public API ───────────────────────────────────────────────────────────────

const useRedis = process.env.OAUTH_STATE_PROVIDER === 'redis'

if (useRedis) {
  logger.info('[oauthStateStore] using Redis')
} else {
  logger.info(
    '[oauthStateStore] using in-memory store (set OAUTH_STATE_PROVIDER=redis for production)',
  )
}

/**
 * Store OAuth state with a 5-minute TTL.
 * Called during /connect before redirecting to the platform.
 */
export async function setOAuthState(state: string, data: OAuthStateData): Promise<void> {
  if (useRedis) return redisSet(state, data)
  memSet(state, data)
}

/**
 * Retrieve and atomically delete OAuth state.
 * Returns null if the state is missing or expired.
 * Called during /callback to validate the CSRF token.
 */
export async function popOAuthState(state: string): Promise<OAuthStateData | null> {
  if (useRedis) {
    const data = await redisGet(state)
    if (data) await redisDel(state)
    return data
  }
  const data = memGet(state)
  if (data) memDel(state)
  return data
}

/**
 * Check whether a state token exists (without consuming it).
 * Used for validation before popping.
 */
export async function hasOAuthState(state: string): Promise<boolean> {
  if (useRedis) {
    const data = await redisGet(state)
    return data !== null
  }
  return memGet(state) !== null
}
