import { createLogger } from '@postpilot/logger'
const logger = createLogger('analytics-engine')

// Metric ingestion job — consumes post.published events, schedules ingestion
// 48 hours after published_at, calls PlatformAdapter.getMetrics, persists PostMetrics.
// Requirements: 5.1, 5.6

import type { Post, Channel, PostMetrics } from '@postpilot/types'
import { getPostById, getChannelById, insertPostMetrics, getMetricsByPostId } from './db.js'
import { getAnalyticsAdapter } from './platformAdapters.js'
import { getTokens } from './vault.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const INGESTION_DELAY_MS = 48 * 60 * 60 * 1000 // 48 hours
const MAX_RETRIES = 3
const RETRY_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 hours between retries (3 retries over 6 hours)

// ─── In-memory job queue (replaced by real scheduler in task 15) ──────────────

interface IngestionJob {
  postId: string
  channelId: string
  platform: string
  scheduledAt: number // unix ms
  retryCount: number
}

const pendingJobs = new Map<string, IngestionJob>()

// ─── Schedule ingestion ───────────────────────────────────────────────────────

export function scheduleMetricIngestion(
  postId: string,
  channelId: string,
  platform: string,
  publishedAt: Date,
): void {
  const scheduledAt = publishedAt.getTime() + INGESTION_DELAY_MS
  const job: IngestionJob = { postId, channelId, platform, scheduledAt, retryCount: 0 }
  pendingJobs.set(postId, job)

  const delayMs = Math.max(0, scheduledAt - Date.now())
  logger.info(
    `[analytics-engine] metric ingestion scheduled for post ${postId} in ${Math.round(delayMs / 3600_000)}h`,
  )

  setTimeout(() => runIngestionJob(job), delayMs)
}

// ─── Run ingestion job ────────────────────────────────────────────────────────

export async function runIngestionJob(job: IngestionJob): Promise<PostMetrics | null> {
  const { postId, channelId } = job

  // Idempotency: skip if already ingested
  const existing = await getMetricsByPostId(postId)
  if (existing) {
    logger.info(`[analytics-engine] metrics already ingested for post ${postId}, skipping`)
    pendingJobs.delete(postId)
    return existing
  }

  const post = await getPostById(postId)
  if (!post) {
    logger.error(`[analytics-engine] post not found: ${postId}`)
    pendingJobs.delete(postId)
    return null
  }

  const channel = await getChannelById(channelId)
  if (!channel) {
    logger.error(`[analytics-engine] channel not found: ${channelId}`)
    pendingJobs.delete(postId)
    return null
  }

  try {
    const tokens = await getTokens(channel.token_vault_key)
    const adapter = getAnalyticsAdapter(channel.platform)
    const raw = await adapter.getMetrics(post, channel, tokens)

    // Requirement 5.6: store null for unavailable metrics, never substitute defaults
    const metrics: PostMetrics = {
      id: crypto.randomUUID(),
      post_id: postId,
      platform: channel.platform,
      ingested_at: new Date(),
      views: raw.views,
      likes: raw.likes,
      comments: raw.comments,
      shares: raw.shares,
      watch_time_seconds: raw.watch_time_seconds,
      engagement_rate: raw.engagement_rate,
    }

    const saved = await insertPostMetrics(metrics)
    logger.info(`[analytics-engine] metrics ingested for post ${postId}`)
    pendingJobs.delete(postId)
    return saved
  } catch (err) {
    const newRetryCount = job.retryCount + 1
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[analytics-engine] metric ingestion failed for post ${postId} (attempt ${newRetryCount}/${MAX_RETRIES})`,
    )

    if (newRetryCount >= MAX_RETRIES) {
      logger.error(`[analytics-engine] metric ingestion exhausted retries for post ${postId}`)
      pendingJobs.delete(postId)
      return null
    }

    // Retry up to 3 times over 6 hours (2h intervals)
    const retryJob: IngestionJob = { ...job, retryCount: newRetryCount }
    pendingJobs.set(postId, retryJob)
    setTimeout(() => runIngestionJob(retryJob), RETRY_INTERVAL_MS)
    return null
  }
}

// ─── Handle post.published event ─────────────────────────────────────────────

export function handlePostPublished(payload: {
  postId: string
  channelId: string
  publishedAt: string
  platformPostId: string
}): void {
  const publishedAt = new Date(payload.publishedAt)
  // We need the platform — look it up lazily when the job fires
  // For now schedule with channelId; platform resolved at ingestion time
  scheduleMetricIngestion(payload.postId, payload.channelId, 'unknown', publishedAt)
}
