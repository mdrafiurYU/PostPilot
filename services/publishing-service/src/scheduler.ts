// Scheduler loop — polls for due posts and dispatches them to platform adapters.
// Also handles retry logic with exponential backoff.

import type { Post, Channel } from '@postpilot/types'
import {
  getScheduledPostsDue,
  updatePostStatus,
  getChannelById,
  updateChannelStatus,
  cancelPostsByChannel,
} from './db.js'
import { getPlatformAdapter, type PlatformAdapter, type OAuthTokens } from './platformAdapters.js'
import { getTokens } from './vault.js'
import { publishEvent } from './messageBus.js'
import { broadcastBatchStatusUpdate } from './batchBroadcast.js'
import { createLogger } from '@postpilot/logger'

const logger = createLogger('publishing-service')

// ─── PlatformApiError ──────────────────────────────────────────────────────

export class PlatformApiError extends Error {
  statusCode: number
  retryAfterSeconds?: number

  constructor(statusCode: number, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'PlatformApiError'
    this.statusCode = statusCode
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// ─── Retry delays (ms) ─────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]
const MAX_RETRIES = 3

// ─── Retry / error handling ────────────────────────────────────────────────

export async function handlePublishError(
  post: Post,
  channel: Channel,
  error: PlatformApiError,
  adapter: PlatformAdapter,
  tokens: OAuthTokens,
): Promise<void> {
  const { statusCode } = error

  if (statusCode === 400) {
    // Bad request — fail immediately, no retry
    await updatePostStatus(post.id, 'failed', { last_error: error.message })
    if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
    await publishEvent({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'post.failed',
      payload: {
        postId: post.id,
        channelId: post.channel_id,
        error: error.message,
        retryCount: post.retry_count,
      },
    })
    logger.info(` post ${post.id} failed (400): ${error.message}`)
    return
  }

  if (statusCode === 429) {
    // Rate limited — back off using Retry-After; do NOT increment retry_count
    const backoffMs = (error.retryAfterSeconds ?? 60) * 1000
    logger.info(` post ${post.id} rate-limited (429), backing off ${backoffMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, backoffMs))
    // Re-attempt publish after backoff (status stays 'publishing')
    try {
      const result = await adapter.publishPost(post, channel, tokens)
      await updatePostStatus(post.id, 'published', {
        published_at: result.publishedAt,
        platform_post_id: result.platformPostId,
      })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'published')
      await publishEvent({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: 'post.published',
        payload: {
          postId: post.id,
          channelId: post.channel_id,
          publishedAt: result.publishedAt.toISOString(),
          platformPostId: result.platformPostId,
        },
      })
    } catch (retryErr) {
      // If it fails again after 429 backoff, mark as failed
      const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      await updatePostStatus(post.id, 'failed', { last_error: errMsg })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
    }
    return
  }

  if (statusCode === 401 || statusCode === 403) {
    // Auth error — try to refresh token
    logger.info(` post ${post.id} auth error (${statusCode}), refreshing token`)
    try {
      const newTokens = await adapter.refreshToken(channel, tokens.refresh_token)
      // Retry once with new tokens
      const result = await adapter.publishPost(post, channel, newTokens)
      await updatePostStatus(post.id, 'published', {
        published_at: result.publishedAt,
        platform_post_id: result.platformPostId,
      })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'published')
      await publishEvent({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: 'post.published',
        payload: {
          postId: post.id,
          channelId: post.channel_id,
          publishedAt: result.publishedAt.toISOString(),
          platformPostId: result.platformPostId,
        },
      })
    } catch (_refreshErr) {
      // Refresh failed — mark channel as token_expired, cancel posts, emit event
      logger.info(` token refresh failed for channel ${channel.id}`)
      await updateChannelStatus(channel.id, 'token_expired')
      await cancelPostsByChannel(channel.id)
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
    }
    return
  }

  // 5xx — retry with exponential backoff
  if (statusCode >= 500) {
    const newRetryCount = post.retry_count + 1
    await updatePostStatus(post.id, 'publishing', {
      retry_count: newRetryCount,
      last_error: error.message,
    })

    if (newRetryCount >= MAX_RETRIES) {
      // Exhausted retries — mark as failed
      await updatePostStatus(post.id, 'failed', {
        retry_count: newRetryCount,
        last_error: error.message,
      })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
      await publishEvent({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: 'post.failed',
        payload: {
          postId: post.id,
          channelId: post.channel_id,
          error: error.message,
          retryCount: newRetryCount,
        },
      })
      logger.info(` post ${post.id} failed after ${newRetryCount} retries`)
      return
    }

    // Schedule retry after backoff delay
    const delayMs =
      RETRY_DELAYS_MS[newRetryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    logger.info(` post ${post.id} retry ${newRetryCount}/${MAX_RETRIES} in ${delayMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    // Re-attempt
    try {
      const result = await adapter.publishPost(
        { ...post, retry_count: newRetryCount },
        channel,
        tokens,
      )
      await updatePostStatus(post.id, 'published', {
        published_at: result.publishedAt,
        platform_post_id: result.platformPostId,
        retry_count: newRetryCount,
      })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'published')
      await publishEvent({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: 'post.published',
        payload: {
          postId: post.id,
          channelId: post.channel_id,
          publishedAt: result.publishedAt.toISOString(),
          platformPostId: result.platformPostId,
        },
      })
    } catch (retryErr) {
      if (retryErr instanceof PlatformApiError) {
        await handlePublishError(
          { ...post, retry_count: newRetryCount },
          channel,
          retryErr,
          adapter,
          tokens,
        )
      } else {
        const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        await updatePostStatus(post.id, 'failed', {
          retry_count: newRetryCount,
          last_error: errMsg,
        })
        if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
      }
    }
    return
  }

  // Unknown error — mark as failed
  await updatePostStatus(post.id, 'failed', { last_error: error.message })
  if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
}

// ─── Dispatch a single post ────────────────────────────────────────────────

async function dispatchPost(post: Post): Promise<void> {
  // Mark as publishing before dispatch
  await updatePostStatus(post.id, 'publishing')
  if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'publishing')

  const channel = await getChannelById(post.channel_id)
  if (!channel) {
    logger.error(
      { err: new Error('Channel not found') },
      ` channel not found for post ${post.id}: ${post.channel_id}`,
    )
    await updatePostStatus(post.id, 'failed', { last_error: 'Channel not found' })
    if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
    return
  }

  // Get tokens from vault (stub returns mock tokens)
  const tokens = await getTokens(channel.token_vault_key)
  const adapter = getPlatformAdapter(channel.platform)

  try {
    const result = await adapter.publishPost(post, channel, tokens)
    await updatePostStatus(post.id, 'published', {
      published_at: result.publishedAt,
      platform_post_id: result.platformPostId,
    })
    if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'published')
    await publishEvent({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'post.published',
      payload: {
        postId: post.id,
        channelId: post.channel_id,
        publishedAt: result.publishedAt.toISOString(),
        platformPostId: result.platformPostId,
      },
    })
    logger.info(` post ${post.id} published successfully`)
  } catch (err) {
    if (err instanceof PlatformApiError) {
      await handlePublishError(post, channel, err, adapter, tokens)
    } else {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error(
        { err: err instanceof Error ? err : new Error(errMsg) },
        ` unexpected error publishing post ${post.id}`,
      )
      await updatePostStatus(post.id, 'failed', { last_error: errMsg })
      if (post.batch_id) await broadcastBatchStatusUpdate(post.batch_id, post.id, 'failed')
    }
  }
}

// ─── Scheduler loop ────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000 // 10 seconds
const LOOKAHEAD_MS = 60_000 // 60 seconds

export function startSchedulerLoop(): void {
  logger.info('[publishing-service] scheduler loop started')

  const tick = async () => {
    try {
      const cutoff = new Date(Date.now() + LOOKAHEAD_MS)
      const duePosts = await getScheduledPostsDue(cutoff)

      if (duePosts.length > 0) {
        logger.info(` dispatching ${duePosts.length} due post(s)`)
      }

      // Dispatch all due posts concurrently
      await Promise.allSettled(duePosts.map(dispatchPost))
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : new Error(String(err)) },
        '[publishing-service] scheduler tick error',
      )
    }

    setTimeout(tick, POLL_INTERVAL_MS)
  }

  // Start first tick
  setTimeout(tick, POLL_INTERVAL_MS)
}
