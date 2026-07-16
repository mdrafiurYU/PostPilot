// OAuth 2.0 Integration Tests — Auth Service
// Tests the OAuth connect/callback flow, token refresh, and channel disconnect
// for all 5 platforms: TikTok, Instagram, YouTube, LinkedIn, Facebook.
//
// Requirements: 6.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { Channel } from '@postpilot/types'

// ─── Mock: database ───────────────────────────────────────────────────────────

const channelStore = new Map<string, Channel>()

vi.mock('./db.js', () => ({
  insertChannel: vi.fn(async (channel: Channel) => {
    channelStore.set(channel.id, channel)
    return channel
  }),
  getChannelById: vi.fn(async (id: string) => channelStore.get(id) ?? null),
  getChannelsByCreatorAndPlatform: vi.fn(async () => []),
  updateChannelStatus: vi.fn(async (id: string, status: Channel['status']) => {
    const ch = channelStore.get(id)
    if (ch) channelStore.set(id, { ...ch, status })
  }),
  updateChannelTokenExpiry: vi.fn(async (id: string, tokenExpiresAt: Date) => {
    const ch = channelStore.get(id)
    if (ch) channelStore.set(id, { ...ch, token_expires_at: tokenExpiresAt })
  }),
  getChannelsExpiringBefore: vi.fn(async () => []),
  cancelPostsByChannel: vi.fn(async () => undefined),
  suspendPostsByChannel: vi.fn(async () => undefined),
}))

// ─── Mock: vault ──────────────────────────────────────────────────────────────

const vaultStore = new Map<string, { access_token: string; refresh_token: string; expires_at: number }>()

vi.mock('./vault.js', () => ({
  storeTokens: vi.fn(async (key: string, tokens: { access_token: string; refresh_token: string; expires_at: number }) => {
    vaultStore.set(key, { ...tokens })
  }),
  getTokens: vi.fn(async (key: string) => {
    const tokens = vaultStore.get(key)
    if (!tokens) throw new Error(`[vault] no tokens found for key: ${key}`)
    return { ...tokens }
  }),
  deleteTokens: vi.fn(async (key: string) => {
    vaultStore.delete(key)
  }),
}))

// ─── Mock: message bus ────────────────────────────────────────────────────────

vi.mock('./messageBus.js', () => ({
  publishEvent: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
}))

// ─── Import app after mocks are set up ───────────────────────────────────────

import { app } from './index.js'
import { getChannelById, getChannelsByCreatorAndPlatform, cancelPostsByChannel, suspendPostsByChannel } from './db.js'
import { getTokens, deleteTokens } from './vault.js'
import { publishEvent } from './messageBus.js'

// ─── HTTP test helpers ────────────────────────────────────────────────────────

interface TestResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

function makeRequest(
  server: http.Server,
  method: string,
  path: string
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number }
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let body: unknown = {}
        try { body = JSON.parse(data) } catch { body = data }
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body,
        })
      })
    })

    req.on('error', reject)
    req.end()
  })
}

function startServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook'] as const
type Platform = (typeof PLATFORMS)[number]

function seedChannel(platform: Platform, overrides: Partial<Channel> = {}): Channel {
  const id = overrides.id ?? `channel-${platform}-${crypto.randomUUID()}`
  const vaultKey = `postpilot/channels/${id}/tokens`
  const channel: Channel = {
    id,
    creator_id: 'creator-test-1',
    platform,
    platform_user_id: `${platform}_user_123`,
    platform_username: `${platform}_creator`,
    token_vault_key: vaultKey,
    token_expires_at: new Date(Date.now() + 3600_000),
    status: 'active',
    post_count: 5,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
  channelStore.set(id, channel)
  vaultStore.set(vaultKey, {
    access_token: `access_${platform}_abc`,
    refresh_token: `refresh_${platform}_abc`,
    expires_at: Date.now() + 3600_000,
  })
  return channel
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OAuth 2.0 integration — connect flow (Req 6.1)', () => {
  let server: http.Server

  beforeEach(async () => {
    channelStore.clear()
    vaultStore.clear()
    vi.clearAllMocks()
    server = await startServer()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it.each(PLATFORMS)(
    '%s: GET /auth/:platform/connect redirects to platform authorization URL',
    async (platform) => {
      const res = await makeRequest(server, 'GET', `/auth/${platform}/connect?creator_id=creator-test-1`)

      // Should redirect (302) to the platform's OAuth authorization URL
      expect(res.status).toBe(302)
      expect(res.headers.location).toBeDefined()

      const location = res.headers.location as string

      const expectedPrefixes: Record<Platform, string> = {
        tiktok: 'https://www.tiktok.com/auth/authorize/',
        instagram: 'https://www.facebook.com/v18.0/dialog/oauth',
        youtube: 'https://accounts.google.com/o/oauth2/v2/auth',
        linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
        facebook: 'https://www.facebook.com/v18.0/dialog/oauth',
      }

      expect(location).toContain(expectedPrefixes[platform])
    }
  )

  it.each(PLATFORMS)(
    '%s: connect URL includes required OAuth parameters',
    async (platform) => {
      const res = await makeRequest(server, 'GET', `/auth/${platform}/connect?creator_id=creator-test-1`)

      expect(res.status).toBe(302)
      const location = new URL(res.headers.location as string)

      expect(location.searchParams.get('response_type')).toBe('code')
      expect(location.searchParams.get('state')).toBeTruthy()
      expect(location.searchParams.get('scope')).toBeTruthy()
      expect(location.searchParams.get('redirect_uri')).toContain(`/auth/${platform}/callback`)
    }
  )

  it('returns 400 for unsupported platform', async () => {
    const res = await makeRequest(server, 'GET', '/auth/twitter/connect?creator_id=creator-test-1')

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/unsupported platform/i)
  })

  it('returns 400 when creator_id is missing', async () => {
    const res = await makeRequest(server, 'GET', '/auth/tiktok/connect')

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/creator_id/i)
  })
})

describe('OAuth 2.0 integration — callback / token exchange (Req 6.1, 6.2)', () => {
  let server: http.Server

  beforeEach(async () => {
    channelStore.clear()
    vaultStore.clear()
    vi.clearAllMocks()
    server = await startServer()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it.each(PLATFORMS)(
    '%s: callback exchanges code for tokens and creates Channel record',
    async (platform) => {
      // Step 1: initiate connect to register state
      const connectRes = await makeRequest(server, 'GET', `/auth/${platform}/connect?creator_id=creator-test-1`)
      expect(connectRes.status).toBe(302)

      const state = new URL(connectRes.headers.location as string).searchParams.get('state')!
      expect(state).toBeTruthy()

      // Step 2: simulate callback with the state and a mock code
      const callbackRes = await makeRequest(
        server,
        'GET',
        `/auth/${platform}/callback?code=mock_code_${platform}&state=${state}`
      )

      expect(callbackRes.status).toBe(200)
      const channel = (callbackRes.body as { channel: Channel }).channel
      expect(channel).toBeDefined()
      expect(channel.platform).toBe(platform)
      expect(channel.creator_id).toBe('creator-test-1')
      expect(channel.status).toBe('active')
    }
  )

  it.each(PLATFORMS)(
    '%s: Channel record contains no plaintext credentials — only token_vault_key (Req 6.2)',
    async (platform) => {
      const connectRes = await makeRequest(server, 'GET', `/auth/${platform}/connect?creator_id=creator-test-2`)
      const state = new URL(connectRes.headers.location as string).searchParams.get('state')!

      const callbackRes = await makeRequest(
        server,
        'GET',
        `/auth/${platform}/callback?code=mock_code_${platform}&state=${state}`
      )

      expect(callbackRes.status).toBe(200)
      const channel = (callbackRes.body as { channel: Record<string, unknown> }).channel

      // Must have token_vault_key (a vault reference, not the token itself)
      expect(channel.token_vault_key).toBeTruthy()
      expect(typeof channel.token_vault_key).toBe('string')
      expect(channel.token_vault_key as string).toMatch(/^postpilot\/channels\//)

      // Must NOT contain any plaintext credential fields
      expect(channel).not.toHaveProperty('access_token')
      expect(channel).not.toHaveProperty('refresh_token')
      expect(channel).not.toHaveProperty('password')
      expect(channel).not.toHaveProperty('client_secret')
    }
  )

  it.each(PLATFORMS)(
    '%s: tokens are stored in vault under the channel vault key',
    async (platform) => {
      const connectRes = await makeRequest(server, 'GET', `/auth/${platform}/connect?creator_id=creator-test-3`)
      const state = new URL(connectRes.headers.location as string).searchParams.get('state')!

      const callbackRes = await makeRequest(
        server,
        'GET',
        `/auth/${platform}/callback?code=mock_code_${platform}&state=${state}`
      )

      expect(callbackRes.status).toBe(200)
      const channel = (callbackRes.body as { channel: Channel }).channel

      // Tokens must be retrievable from vault using the vault key
      const tokens = await getTokens(channel.token_vault_key)
      expect(tokens.access_token).toBeTruthy()
      expect(tokens.refresh_token).toBeTruthy()
      expect(tokens.expires_at).toBeGreaterThan(Date.now())
    }
  )

  it('callback returns 400 for invalid/missing state (CSRF check)', async () => {
    const res = await makeRequest(
      server,
      'GET',
      '/auth/tiktok/callback?code=some_code&state=invalid-state-xyz'
    )

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/state/i)
  })

  it('callback returns 400 when code is missing', async () => {
    const connectRes = await makeRequest(server, 'GET', '/auth/tiktok/connect?creator_id=creator-test-4')
    const state = new URL(connectRes.headers.location as string).searchParams.get('state')!

    const res = await makeRequest(server, 'GET', `/auth/tiktok/callback?state=${state}`)

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/code/i)
  })
})

describe('OAuth 2.0 integration — token refresh (Req 6.3)', () => {
  beforeEach(() => {
    channelStore.clear()
    vaultStore.clear()
    vi.clearAllMocks()
  })

  it.each(PLATFORMS)(
    '%s: refreshAccessToken updates token_expires_at to a future time',
    async (platform) => {
      // Seed with an already-expired token so the refreshed expiry is clearly newer
      const channel = seedChannel(platform, {
        token_expires_at: new Date(Date.now() - 60_000), // expired 1 minute ago
      })
      const originalExpiry = channel.token_expires_at.getTime()

      const { refreshAccessToken } = await import('./tokenRefresh.js')
      await refreshAccessToken(channel)

      const updated = await getChannelById(channel.id)
      expect(updated).not.toBeNull()
      expect(updated!.token_expires_at.getTime()).toBeGreaterThan(originalExpiry)
      // New expiry should also be in the future
      expect(updated!.token_expires_at.getTime()).toBeGreaterThan(Date.now())
    }
  )

  it.each(PLATFORMS)(
    '%s: refreshAccessToken stores new access_token in vault',
    async (platform) => {
      const channel = seedChannel(platform)
      const tokensBefore = await getTokens(channel.token_vault_key)

      const { refreshAccessToken } = await import('./tokenRefresh.js')
      await refreshAccessToken(channel)

      const tokensAfter = await getTokens(channel.token_vault_key)
      expect(tokensAfter.access_token).toBeTruthy()
      // Refresh token is preserved (not rotated in stub)
      expect(tokensAfter.refresh_token).toBe(tokensBefore.refresh_token)
    }
  )

  it.each(PLATFORMS)(
    '%s: handleRefreshFailure sets channel status to token_expired',
    async (platform) => {
      const channel = seedChannel(platform)

      const { handleRefreshFailure } = await import('./tokenRefresh.js')
      await handleRefreshFailure(channel)

      const updated = await getChannelById(channel.id)
      expect(updated!.status).toBe('token_expired')
    }
  )

  it.each(PLATFORMS)(
    '%s: handleRefreshFailure suspends draft/scheduled posts for the channel',
    async (platform) => {
      const channel = seedChannel(platform)

      const { handleRefreshFailure } = await import('./tokenRefresh.js')
      await handleRefreshFailure(channel)

      expect(vi.mocked(suspendPostsByChannel)).toHaveBeenCalledWith(channel.id)
    }
  )

  it.each(PLATFORMS)(
    '%s: handleRefreshFailure emits channel.token_expired notification event',
    async (platform) => {
      const channel = seedChannel(platform)

      const { handleRefreshFailure } = await import('./tokenRefresh.js')
      await handleRefreshFailure(channel)

      expect(vi.mocked(publishEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'channel.token_expired',
          payload: expect.objectContaining({
            channelId: channel.id,
            platform,
          }),
        })
      )
    }
  )
})

describe('OAuth 2.0 integration — channel disconnect (Req 6.5)', () => {
  let server: http.Server

  beforeEach(async () => {
    channelStore.clear()
    vaultStore.clear()
    vi.clearAllMocks()
    server = await startServer()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it.each(PLATFORMS)(
    '%s: DELETE /channels/:id sets channel status to disconnected',
    async (platform) => {
      const channel = seedChannel(platform)

      const res = await makeRequest(server, 'DELETE', `/channels/${channel.id}`)

      expect(res.status).toBe(204)

      const updated = await getChannelById(channel.id)
      expect(updated!.status).toBe('disconnected')
    }
  )

  it.each(PLATFORMS)(
    '%s: DELETE /channels/:id removes tokens from vault',
    async (platform) => {
      const channel = seedChannel(platform)

      // Tokens exist before disconnect
      await expect(getTokens(channel.token_vault_key)).resolves.toBeDefined()

      await makeRequest(server, 'DELETE', `/channels/${channel.id}`)

      // deleteTokens should have been called with the vault key
      expect(vi.mocked(deleteTokens)).toHaveBeenCalledWith(channel.token_vault_key)
      // Vault entry should be gone
      await expect(getTokens(channel.token_vault_key)).rejects.toThrow()
    }
  )

  it.each(PLATFORMS)(
    '%s: DELETE /channels/:id cancels all pending posts for the channel',
    async (platform) => {
      const channel = seedChannel(platform)

      await makeRequest(server, 'DELETE', `/channels/${channel.id}`)

      expect(vi.mocked(cancelPostsByChannel)).toHaveBeenCalledWith(channel.id)
    }
  )

  it('returns 404 when channel does not exist', async () => {
    const res = await makeRequest(server, 'DELETE', '/channels/non-existent-channel-id')

    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toMatch(/not found/i)
  })
})

describe('OAuth 2.0 integration — per-platform channel limit (Req 6.6)', () => {
  let server: http.Server

  beforeEach(async () => {
    channelStore.clear()
    vaultStore.clear()
    vi.clearAllMocks()
    server = await startServer()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('returns 422 when creator already has 10 channels on a platform', async () => {
    vi.mocked(getChannelsByCreatorAndPlatform).mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => seedChannel('tiktok', { id: `channel-tiktok-limit-${i}` }))
    )

    const res = await makeRequest(server, 'GET', '/auth/tiktok/connect?creator_id=creator-at-limit')

    expect(res.status).toBe(422)
    expect((res.body as { error: string }).error).toMatch(/maximum/i)
  })
})
