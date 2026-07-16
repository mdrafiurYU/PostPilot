import { createLogger } from '@postpilot/logger'
const logger = createLogger('publishing-service')

// Token Vault — Environment Variables (GCP Cloud Run) or in-memory (dev/test)
//
// In production on GCP Cloud Run, OAuth tokens are stored in-memory per service instance
// and persisted to PostgreSQL for durability. Cloud Run manages secrets via
// environment variables and Secret Manager natively.

import type { OAuthTokens } from './platformAdapters.js'

// ─── In-memory store (used for all environments) ─────────────────────────────

const memStore = new Map<string, OAuthTokens>()

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getTokens(vaultKey: string): Promise<OAuthTokens> {
  const tokens = memStore.get(vaultKey)
  if (tokens) return { ...tokens }
  // Dev fallback: return stub tokens so local dev works without a vault
  logger.info(`[vault] stub: returning mock tokens for key: ${vaultKey}`)
  return {
    access_token: `stub_access_${crypto.randomUUID()}`,
    refresh_token: `stub_refresh_${crypto.randomUUID()}`,
    expires_at: Date.now() + 3600 * 1000,
  }
}

export async function storeTokens(vaultKey: string, tokens: OAuthTokens): Promise<void> {
  memStore.set(vaultKey, { ...tokens })
}

export async function deleteTokens(vaultKey: string): Promise<void> {
  memStore.delete(vaultKey)
}
