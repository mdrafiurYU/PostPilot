import { createLogger } from '@postpilot/logger'
const logger = createLogger('notification-service')

// Routes message bus events to the appropriate notification types and channels
// Requirements: 1.7, 4.5, 6.4, 7.10

import type {
  AssetAdaptedEvent,
  PostPublishedEvent,
  PostFailedEvent,
  AssetQualityShortfallEvent,
  ChannelTokenExpiredEvent,
} from '@postpilot/events'
import { insertNotification, type NotificationType, type NotificationChannel } from './db.js'
import { broadcastInApp } from './websocket.js'
import { sendPushNotification } from './pushProvider.js'
import { sendEmail, getCreatorEmail } from './emailProvider.js'

// ─── Helpers ──────────────────────────────────────────────────────────────

async function deliver(
  creatorId: string,
  type: NotificationType,
  channels: NotificationChannel[],
  title: string,
  body: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  for (const channel of channels) {
    const notification = await insertNotification({
      id: crypto.randomUUID(),
      creator_id: creatorId,
      type,
      channel,
      title,
      body,
      metadata,
    })

    if (channel === 'in_app') {
      broadcastInApp(creatorId, notification)
    } else if (channel === 'push') {
      await sendPushNotification({ creatorId, title, body }).catch((err) =>
        logger.error(
          { err: err instanceof Error ? err : new Error(String(err)) },
          '[notificationRouter] push delivery failed',
        ),
      )
    } else if (channel === 'email') {
      const address = await getCreatorEmail(creatorId)
      if (address) {
        await sendEmail({ toCreatorId: creatorId, toAddress: address, subject: title, body }).catch(
          (err) =>
            logger.error(
              { err: err instanceof Error ? err : new Error(String(err)) },
              '[notificationRouter] email delivery failed',
            ),
        )
      }
    }
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────

/**
 * asset.adapted — all platform adaptations are ready (Requirement 1.7)
 * Delivery: in-app + push
 */
export async function handleAssetAdapted(event: AssetAdaptedEvent): Promise<void> {
  const { assetId } = event.payload
  // creatorId is not on AssetAdaptedEvent payload; look it up via metadata if needed.
  // For now we log and skip DB write since creatorId is unavailable on this event.
  // In production, enrich via Asset Service lookup.
  logger.info(`[notificationRouter] asset.adapted for asset ${assetId} — notify creator`)
  // TODO: resolve creatorId from assetId via Asset Service or DB lookup, then call deliver()
}

/**
 * post.published — post successfully published (Requirement 4.5)
 * Delivery: in-app
 */
export async function handlePostPublished(
  event: PostPublishedEvent,
  creatorId: string,
): Promise<void> {
  const { postId, platformPostId } = event.payload
  await deliver(
    creatorId,
    'post_published',
    ['in_app'],
    'Post published',
    `Your post was published successfully (platform ID: ${platformPostId}).`,
    { postId, platformPostId },
  )
}

/**
 * post.failed — post failed after all retries (Requirements 4.5)
 * Delivery: in-app + push + email (critical alert)
 */
export async function handlePostFailed(event: PostFailedEvent, creatorId: string): Promise<void> {
  const { postId, error } = event.payload
  await deliver(
    creatorId,
    'post_failed',
    ['in_app', 'push', 'email'],
    'Post failed to publish',
    `Your post could not be published. Reason: ${error}. You can reschedule it from the dashboard.`,
    { postId, error },
  )
}

/**
 * asset.quality_shortfall — VMAF target unachievable (Requirement 7.10)
 * Delivery: in-app
 */
export async function handleQualityShortfall(
  event: AssetQualityShortfallEvent,
  creatorId: string,
): Promise<void> {
  const { assetId, targetVmaf, achievedVmaf } = event.payload
  await deliver(
    creatorId,
    'quality_shortfall',
    ['in_app'],
    'Quality target not fully met',
    `Asset ${assetId} could not reach the target quality score (target: ${targetVmaf}, achieved: ${achievedVmaf}). The best available rendition has been retained.`,
    { assetId, targetVmaf, achievedVmaf },
  )
}

/**
 * channel.token_expired — re-authentication required (Requirement 6.4)
 * Delivery: in-app + push + email (critical alert)
 */
export async function handleTokenExpired(event: ChannelTokenExpiredEvent): Promise<void> {
  const { channelId, creatorId, platform } = event.payload
  await deliver(
    creatorId,
    'reauth_required',
    ['in_app', 'push', 'email'],
    'Re-authentication required',
    `Your ${platform} account needs to be reconnected. Scheduled posts for this channel have been suspended until you re-authenticate.`,
    { channelId, platform },
  )
}
