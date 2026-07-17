import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('targeting-engine')

// Targeting Engine
// Consumes asset.repurposed events; generates hashtag suggestions.
// Exposes GET /targeting/hashtags?post_id=&platform=
// Requirements: 3.1, 3.2

import { randomUUID } from 'crypto'
import express, { type Express, type Request, type Response } from 'express'
import type { AssetRepurposedEvent, TargetingReadyEvent } from '@postpilot/events'
import type { Platform } from '@postpilot/types'
import { subscribe, publishEvent, startConsuming } from './messageBus.js'
import { upsertHashtagSuggestions, getHashtagSuggestions, getChannel, getPost } from './db.js'
import { generateHashtagSuggestions } from './hashtagGeneration.js'
import { generateTimingRecommendations } from './timingRecommendation.js'
import { getTrends } from './trendAnalysis.js'
import { generatePrediction } from './performancePrediction.js'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

// ─── Message bus consumer ─────────────────────────────────────────────────────

async function initializeMessageBus() {

  await startConsuming()

  subscribe<AssetRepurposedEvent>('asset.repurposed', async (event) => {
    const { assetId, clips } = event.payload

    logger.info(`[targeting-engine] processing asset.repurposed for asset ${assetId}`)

    try {
      // For each clip, generate hashtag suggestions for all platforms and persist them.
      // The clip id is used as the post_id for pre-generation purposes.
      for (const clip of clips) {
        const postId = clip.id
        const allHashtags = []

        for (const platform of PLATFORMS) {
          const suggestions = generateHashtagSuggestions(postId, platform)
          await upsertHashtagSuggestions(postId, suggestions)
          allHashtags.push(...suggestions)
          logger.info(
            `[targeting-engine] generated ${suggestions.length} hashtags for clip ${postId} on ${platform}`,
          )
        }

        // Emit targeting.ready with hashtags for the first platform as a representative sample
        const primaryPlatform: Platform = 'tiktok'
        const primaryHashtags = allHashtags.filter((h) => h.platform === primaryPlatform)

        const targetingReadyEvent: TargetingReadyEvent = {
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          type: 'targeting.ready',
          payload: {
            assetId,
            postId,
            hashtags: primaryHashtags,
            timingSlots: [], // populated by timing endpoint (task 7.3)
          },
        }
        await publishEvent(targetingReadyEvent)
      }

      logger.info(`[targeting-engine] hashtag pre-generation complete for asset ${assetId}`)
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : new Error(String(err)) },
        `[targeting-engine] failed to process asset.repurposed for ${assetId}`,
      )
    }
  })
}
// ─── HTTP server ──────────────────────────────────────────────────────────────

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

/**
 * GET /targeting/hashtags?post_id=<id>&platform=<platform>
 *
 * Returns 5–30 hashtags ranked by predicted_reach_score descending.
 * Each hashtag is classified as high (>1M posts), mid (100K–1M), or niche (<100K).
 *
 * Requirements: 3.1, 3.2
 */
app.get('/targeting/hashtags', async (req: Request, res: Response) => {
  const { post_id, platform } = req.query

  if (typeof post_id !== 'string' || !post_id) {
    return res.status(400).json({ error: 'post_id query parameter is required' })
  }

  if (typeof platform !== 'string' || !platform) {
    return res.status(400).json({ error: 'platform query parameter is required' })
  }

  if (!PLATFORMS.includes(platform as Platform)) {
    return res.status(400).json({
      error: `platform must be one of: ${PLATFORMS.join(', ')}`,
    })
  }

  const typedPlatform = platform as Platform

  try {
    // Try to fetch pre-generated suggestions from DB first
    let suggestions = await getHashtagSuggestions(post_id, typedPlatform)

    // If none stored yet, generate on-the-fly
    if (suggestions.length === 0) {
      suggestions = generateHashtagSuggestions(post_id, typedPlatform)
      await upsertHashtagSuggestions(post_id, suggestions)
    }

    // Ensure sorted by predicted_reach_score descending (Req 3.1)
    suggestions.sort((a, b) => b.predicted_reach_score - a.predicted_reach_score)

    return res.status(200).json({ hashtags: suggestions })
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[targeting-engine] error fetching hashtags for post ${post_id}`,
    )
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /targeting/timing?channel_id=<id>
 *
 * Returns exactly 3 time slots within the next 7 days, ordered by predicted engagement descending.
 * Uses channel history when post_count >= 10; falls back to platform benchmarks otherwise.
 *
 * Requirements: 3.3, 3.6
 */
app.get('/targeting/timing', async (req: Request, res: Response) => {
  const { channel_id } = req.query

  if (typeof channel_id !== 'string' || !channel_id) {
    return res.status(400).json({ error: 'channel_id query parameter is required' })
  }

  try {
    const channel = await getChannel(channel_id)

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    const slots = generateTimingRecommendations(channel.id, channel.platform, channel.post_count)

    return res.status(200).json({ timing: slots })
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[targeting-engine] error fetching timing for channel ${channel_id}`,
    )
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /targeting/trends?platform=<platform>&category=<category>
 *
 * Returns exactly 10 trending topics or audio tracks for the given platform and content category.
 * Results are cached for up to 6 hours and refreshed by a background job.
 *
 * Requirements: 3.4
 */
app.get('/targeting/trends', (req: Request, res: Response) => {
  const { platform, category } = req.query

  if (typeof platform !== 'string' || !platform) {
    return res.status(400).json({ error: 'platform query parameter is required' })
  }

  if (!PLATFORMS.includes(platform as Platform)) {
    return res.status(400).json({
      error: `platform must be one of: ${PLATFORMS.join(', ')}`,
    })
  }

  if (typeof category !== 'string' || !category) {
    return res.status(400).json({ error: 'category query parameter is required' })
  }

  const trends = getTrends(platform as Platform, category)
  return res.status(200).json({ trends })
})

/**
 * GET /targeting/prediction?post_id=<id>&platform=<platform>
 *
 * Returns an estimated engagement rate range with a confidence level.
 * Uses platform-wide benchmarks when the channel has fewer than 10 published posts.
 *
 * Requirements: 3.5, 3.6
 */
app.get('/targeting/prediction', async (req: Request, res: Response) => {
  const { post_id, platform } = req.query

  if (typeof post_id !== 'string' || !post_id) {
    return res.status(400).json({ error: 'post_id query parameter is required' })
  }

  if (typeof platform !== 'string' || !platform) {
    return res.status(400).json({ error: 'platform query parameter is required' })
  }

  if (!PLATFORMS.includes(platform as Platform)) {
    return res.status(400).json({
      error: `platform must be one of: ${PLATFORMS.join(', ')}`,
    })
  }

  try {
    const post = await getPost(post_id)
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    const channel = await getChannel(post.channel_id)
    const postCount = channel?.post_count ?? 0

    const prediction = generatePrediction(post_id, platform as Platform, postCount)
    return res.status(200).json(prediction)
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[targeting-engine] error generating prediction for post ${post_id}`,
    )
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Health check ─────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'targeting-engine', uptime: process.uptime() })
})

const PORT = Number(process.env.PORT ?? 8080)

if (process.env.NODE_ENV !== 'test') {

  async function startApplication() {
    await initializeMessageBus()
    app.listen(PORT, () => {
      logger.info(`[targeting-engine] listening on port ${PORT}`)
    })
  }

  startApplication().catch((err) => {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      '[targeting-engine] failed during startup'
    )
    process.exit(1)
  })
}

logger.info('[targeting-engine] started, listening for asset.repurposed events')

export { app }
