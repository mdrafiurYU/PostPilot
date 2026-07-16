import { createLogger } from '@postpilot/logger'
const logger = createLogger('auth-service')

// Token Vault — GCP Secret Manager (production) or in-memory (dev/test)
//
// Set VAULT_PROVIDER=gcp to use GCP Secret Manager.
// Defaults to in-memory when VAULT_PROVIDER is unset or 'memory'.
// On Cloud Run, Application Default Credentials (ADC) are used automatically.
//
// vault_key format: `postpilot/channels/{channelId}/tokens`

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

// ─── GCP Secret Manager implementation ───────────────────────────────────────

import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? ''

const smClient = new SecretManagerServiceClient()

async function gcpGetTokens(vaultKey: string): Promise<OAuthTokens> {
  const name = `projects/${GCP_PROJECT_ID}/secrets/${vaultKey.replace(/\//g, '-')}/versions/latest`
  const [version] = await smClient.accessSecretVersion({ name })
  const payload = version.payload?.data
  if (!payload) {
    throw new Error(`[vault] empty secret for key: ${vaultKey}`)
  }
  const data = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8')
  return JSON.parse(data)
}

async function gcpStoreTokens(vaultKey: string, tokens: OAuthTokens): Promise<void> {
  const secretId = vaultKey.replace(/\//g, '-')
  const parent = `projects/${GCP_PROJECT_ID}`
  const value = JSON.stringify(tokens)

  try {
    // Try adding a new version to an existing secret
    await smClient.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: { data: Buffer.from(value, 'utf-8') },
    })
  } catch (err: any) {
    if (err.code === 5) {
      // NOT_FOUND — secret doesn't exist yet, create it
      await smClient.createSecret({
        parent,
        secretId,
        secret: {
          replication: { automatic: {} },
        },
      })
      await smClient.addSecretVersion({
        parent: `${parent}/secrets/${secretId}`,
        payload: { data: Buffer.from(value, 'utf-8') },
      })
    } else {
      throw err
    }
  }
}

async function gcpDeleteTokens(vaultKey: string): Promise<void> {
  const secretId = vaultKey.replace(/\//g, '-')
  const name = `projects/${GCP_PROJECT_ID}/secrets/${secretId}`
  try {
    await smClient.deleteSecret({ name })
  } catch (err: any) {
    if (err.code === 5) return // NOT_FOUND — already gone
    throw err
  }
}

// ─── In-memory fallback (dev / test) ─────────────────────────────────────────

const memStore = new Map<string, OAuthTokens>()

// ─── Public API — delegates based on VAULT_PROVIDER ──────────────────────────

const useGcp = process.env.VAULT_PROVIDER === 'gcp'

if (useGcp) {
  logger.info('[vault] using GCP Secret Manager')
} else {
  logger.info('[vault] using in-memory store (tokens persisted via PostgreSQL)')
}

export async function storeTokens(vaultKey: string, tokens: OAuthTokens): Promise<void> {
  if (useGcp) return gcpStoreTokens(vaultKey, tokens)
  memStore.set(vaultKey, { ...tokens })
}

export async function getTokens(vaultKey: string): Promise<OAuthTokens> {
  if (useGcp) return gcpGetTokens(vaultKey)
  const tokens = memStore.get(vaultKey)
  if (!tokens) throw new Error(`[vault] no tokens found for key: ${vaultKey}`)
  return { ...tokens }
}

export async function deleteTokens(vaultKey: string): Promise<void> {
  if (useGcp) return gcpDeleteTokens(vaultKey)
  memStore.delete(vaultKey)
}
