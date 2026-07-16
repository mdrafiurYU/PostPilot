// Token Vault — in-memory store for all environments
//
// GCP Cloud Run manages secrets via environment variables and Secret Manager.
// Token persistence is handled by PostgreSQL.

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

// ─── In-memory store (used for all environments) ─────────────────────────────

const memStore = new Map<string, OAuthTokens>()

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getTokens(vaultKey: string): Promise<OAuthTokens> {
  const tokens = memStore.get(vaultKey)
  if (!tokens) throw new Error(`[vault] no tokens found for key: ${vaultKey}`)
  return { ...tokens }
}

export async function storeTokens(vaultKey: string, tokens: OAuthTokens): Promise<void> {
  memStore.set(vaultKey, { ...tokens })
}
