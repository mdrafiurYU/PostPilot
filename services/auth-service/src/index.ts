import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('auth-service')

// Auth Service — Express HTTP server
// Manages user registration, OAuth 2.0 connect/callback flows, automatic token refresh, and channel disconnect.

import express, { type Express } from 'express'
import type { Request, Response } from 'express'
import type { Platform } from '@postpilot/types'
import bcrypt from 'bcryptjs'
import { getOAuthConfig } from './platformAdapters.js'
import { storeTokens, getTokens, deleteTokens } from './vault.js'
import {
  insertChannel,
  getChannelById,
  getChannelsByCreatorAndPlatform,
  updateChannelStatus,
  cancelPostsByChannel,
  createUserWithEmail,
  getUserByEmail,
} from './db.js'
import { startTokenRefreshJob } from './tokenRefresh.js'
import { setOAuthState, popOAuthState } from './oauthStateStore.js'

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

const VALID_PLATFORMS = new Set<Platform>([
  'tiktok',
  'instagram',
  'youtube',
  'linkedin',
  'facebook',
])

const MAX_CHANNELS_PER_PLATFORM = 10

function isPlatform(value: string): value is Platform {
  return VALID_PLATFORMS.has(value as Platform)
}

// ─── POST /auth/signup ─────────────────────────────────────────────────────────
// Creates a new user account with email/password.
app.post('/auth/signup', async (req: Request, res: Response) => {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }

  // Password strength: minimum 6 characters
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    // Check for existing user
    const existing = await getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    // Create user
    const user = await createUserWithEmail(email, password, name)

    // Return safe user data (no password hash)
    const { password_hash, ...safeUser } = user
    return res.status(201).json({ user: safeUser })
  } catch (err) {
    logger.error({ err, email }, 'signup failed')
    return res.status(500).json({ error: 'Failed to create user' })
  }
})

// ─── POST /auth/login ─────────────────────────────────────────────────────────
// Verifies email/password and returns user info (no JWT). NextAuth will create session.
app.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const user = await getUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Return user data (no password hash)
    const { password_hash, ...safeUser } = user
    return res.json({ user: safeUser })
  } catch (err) {
    logger.error({ err, email }, 'login failed')
    return res.status(500).json({ error: 'Login failed' })
  }
})

// ─── GET /auth/:platform/connect ───────────────────────────────────────────
// Redirects the creator to the platform's OAuth authorization URL.
// Query params: creator_id (required), state (optional)
app.get('/auth/:platform/connect', async (req: Request, res: Response) => {
  const { platform } = req.params
  const { creator_id, state: providedState } = req.query as Record<string, string | undefined>

  if (!isPlatform(platform)) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` })
  }

  if (!creator_id) {
    return res.status(400).json({ error: 'creator_id is required' })
  }

  // Enforce per-platform channel limit
  const existing = await getChannelsByCreatorAndPlatform(creator_id, platform)
  if (existing.length >= MAX_CHANNELS_PER_PLATFORM) {
    return res.status(422).json({
      error: `Maximum of ${MAX_CHANNELS_PER_PLATFORM} channels per platform reached`,
    })
  }

  const state = providedState ?? crypto.randomUUID()
  await setOAuthState(state, { creatorId: creator_id, platform })

  const config = getOAuthConfig(platform)
  const redirectUri = `${process.env.BASE_URL ?? 'http://localhost:3004'}/auth/${platform}/callback`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    response_type: 'code',
    state,
  })

  return res.redirect(`${config.authorizationUrl}?${params.toString()}`)
})

// ─── GET /auth/:platform/callback ──────────────────────────────────────────
// Exchanges the authorization code for tokens and creates a Channel record.
// Query params: code, state
app.get('/auth/:platform/callback', async (req: Request, res: Response) => {
  const { platform } = req.params
  const { code, state } = req.query as Record<string, string | undefined>

  if (!isPlatform(platform)) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` })
  }

  if (!state) {
    return res.status(400).json({ error: 'Invalid or missing state parameter (CSRF check failed)' })
  }

  const stateData = await popOAuthState(state)
  if (!stateData) {
    return res.status(400).json({ error: 'Invalid or missing state parameter (CSRF check failed)' })
  }

  if (stateData.platform !== platform) {
    return res.status(400).json({ error: 'State platform mismatch' })
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' })
  }

  const config = getOAuthConfig(platform)
  const redirectUri = `${process.env.BASE_URL ?? 'http://localhost:3004'}/auth/${platform}/callback`

  // Exchange code for tokens — stub the HTTP call; replace with real call in production.
  const tokenResponse = await exchangeCodeForTokens(
    config.tokenUrl,
    config.clientId,
    config.clientSecret,
    code,
    redirectUri,
  )

  const channelId = crypto.randomUUID()
  const vaultKey = `postpilot/channels/${channelId}/tokens`
  const now = new Date()
  const expiresAt = new Date(tokenResponse.expires_at)

  // Store tokens in vault — never in the DB
  await storeTokens(vaultKey, {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: tokenResponse.expires_at,
  })

  const channel = await insertChannel({
    id: channelId,
    creator_id: stateData.creatorId,
    platform,
    platform_user_id: tokenResponse.platform_user_id,
    platform_username: tokenResponse.platform_username,
    token_vault_key: vaultKey,
    token_expires_at: expiresAt,
    status: 'active',
    post_count: 0,
    created_at: now,
    updated_at: now,
  })

  return res.status(200).json({ channel })
})

// ─── DELETE /channels/:id ──────────────────────────────────────────────────
// Disconnects a channel: revokes tokens, deletes vault entry, cancels posts.
app.delete('/channels/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  const channel = await getChannelById(id)
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' })
  }

  // Revoke tokens via platform (stub the HTTP call)
  try {
    const tokens = await getTokens(channel.token_vault_key)
    await revokeTokenOnPlatform(channel.platform, tokens.access_token)
  } catch (err) {
    // Log but don't block disconnect if vault/revoke fails
    logger.error({ err, channelId: id }, 'failed to revoke tokens for channel')
  }

  // Delete vault entry
  await deleteTokens(channel.token_vault_key)

  // Cancel all draft/scheduled posts for this channel
  await cancelPostsByChannel(id)

  // Mark channel as disconnected
  await updateChannelStatus(id, 'disconnected')

  return res.status(204).send()
})

// ─── Stub: exchange authorization code for tokens ─────────────────────────
// Replace with real HTTP call in production.
async function exchangeCodeForTokens(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string
  refresh_token: string
  expires_at: number
  platform_user_id: string
  platform_username: string
}> {
  // In dev/test, return a mock token response
  // Production: POST to tokenUrl with grant_type=authorization_code
  // const response = await fetch(tokenUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({
  //     grant_type: 'authorization_code',
  //     code,
  //     redirect_uri: redirectUri,
  //     client_id: clientId,
  //     client_secret: clientSecret,
  //   }),
  // })
  // const data = await response.json()
  // return { access_token: data.access_token, refresh_token: data.refresh_token, ... }

  return {
    access_token: `stub_access_${crypto.randomUUID()}`,
    refresh_token: `stub_refresh_${crypto.randomUUID()}`,
    expires_at: Date.now() + 3600 * 1000,
    platform_user_id: `stub_user_${crypto.randomUUID()}`,
    platform_username: 'stub_username',
  }
}

// ─── Stub: revoke token on platform ───────────────────────────────────────
// Replace with real HTTP call in production.
async function revokeTokenOnPlatform(platform: Platform, accessToken: string): Promise<void> {
  // Production: call platform-specific revoke endpoint
  // e.g. for Google: POST https://oauth2.googleapis.com/revoke?token=<accessToken>
  logger.info(`[auth-service] stub: revoking token for platform ${platform}`)
}

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'auth-service', uptime: process.uptime() })
})

// ─── Start server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3004

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`[auth-service] listening on port ${PORT}`)
  })
  startTokenRefreshJob()
}

export { app }
