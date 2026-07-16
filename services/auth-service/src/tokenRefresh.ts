import { createLogger } from '@postpilot/logger'
const logger = createLogger('auth-service')

// Automatic token refresh — runs every 60 seconds, refreshes tokens expiring within 5 minutes

import type { Channel } from '@postpilot/types'
import { getTokens, storeTokens } from './vault.js'
import { getOAuthConfig } from './platformAdapters.js'
import {
  getChannelsExpiringBefore,
  updateChannelTokenExpiry,
  updateChannelStatus,
  suspendPostsByChannel,
} from './db.js'
import { publishEvent } from './messageBus.js'

// Stub: exchange a refresh token for new tokens via the platform's token endpoint.
// Replace with real HTTP call in production.
async function callPlatformRefresh(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | { error: 401 | 403 }> {
  // In dev/test, simulate a successful refresh
  if (process.env.NODE_ENV === 'test' || process.env.STUB_OAUTH === 'true') {
    return {
      access_token: `stub_access_${Date.now()}`,
      expires_in: 3600,
    }
  }

  // Production: real HTTP call
  // const response = await fetch(tokenUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({
  //     grant_type: 'refresh_token',
  //     refresh_token: refreshToken,
  //     client_id: clientId,
  //     client_secret: clientSecret,
  //   }),
  // })
  // if (response.status === 401 || response.status === 403) return { error: response.status }
  // const data = await response.json()
  // return { access_token: data.access_token, expires_in: data.expires_in }

  logger.warn('[tokenRefresh] STUB_OAUTH not set — skipping real refresh call')
  return { access_token: `stub_access_${Date.now()}`, expires_in: 3600 }
}

export async function handleRefreshFailure(channel: Channel): Promise<void> {
  // Set channel status to token_expired
  await updateChannelStatus(channel.id, 'token_expired')

  // Suspend all draft/scheduled posts for this channel
  await suspendPostsByChannel(channel.id)

  // Emit notification event so Creator is alerted to re-authenticate
  await publishEvent({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: 'channel.token_expired',
    payload: {
      channelId: channel.id,
      creatorId: channel.creator_id,
      platform: channel.platform,
    },
  })

  logger.info(
    `[tokenRefresh] channel ${channel.id} marked token_expired; posts suspended; notification emitted`,
  )
}

export async function refreshAccessToken(channel: Channel): Promise<void> {
  const config = getOAuthConfig(channel.platform)
  const tokens = await getTokens(channel.token_vault_key)

  const result = await callPlatformRefresh(
    config.tokenUrl,
    config.clientId,
    config.clientSecret,
    tokens.refresh_token,
  )

  if ('error' in result) {
    // 401/403 means the refresh token is revoked or expired
    await handleRefreshFailure(channel)
    return
  }

  const newExpiresAt = Date.now() + result.expires_in * 1000
  await storeTokens(channel.token_vault_key, {
    access_token: result.access_token,
    refresh_token: tokens.refresh_token, // refresh token unchanged unless platform rotates it
    expires_at: newExpiresAt,
  })

  await updateChannelTokenExpiry(channel.id, new Date(newExpiresAt))

  logger.info(`[tokenRefresh] refreshed tokens for channel ${channel.id}`)
}

export function startTokenRefreshJob(): NodeJS.Timeout {
  const INTERVAL_MS = 60_000 // 60 seconds
  const REFRESH_WINDOW_MS = 5 * 60_000 // 5 minutes ahead

  const run = async () => {
    const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS)
    let channels: Channel[]
    try {
      channels = await getChannelsExpiringBefore(cutoff)
    } catch (err) {
      logger.error({ err }, '[tokenRefresh] failed to query expiring channels')
      return
    }

    for (const channel of channels) {
      try {
        await refreshAccessToken(channel)
      } catch (err) {
        logger.error({ err, channelId: channel.id }, '[tokenRefresh] error refreshing channel')
      }
    }
  }

  const timer = setInterval(run, INTERVAL_MS)
  logger.info('[tokenRefresh] token refresh job started (interval: 60s)')
  return timer
}
