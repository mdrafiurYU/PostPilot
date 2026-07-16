import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('analytics-engine')

// Analytics Engine — Express HTTP server
// Consumes post.published events, ingests metrics, generates insights,
// and exposes the performance dashboard aggregation endpoint.
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

import express, { type Express } from 'express'
import type { Request, Response } from 'express'
import type { PostMetrics } from '@postpilot/types'
import { handlePostPublished, runIngestionJob, scheduleMetricIngestion } from './metricIngestion.js'
import { generateInsight, computeChannelAverage } from './insightGeneration.js'
import { generateDoMoreLikeThis } from './recommendations.js'
import {
  getPostById,
  getChannelById,
  getMetricsByPostId,
  getMetricsByCreatorAndRange,
  getPublishedPostsByCreator,
  getInsightByPostId,
} from './db.js'

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

// ─── POST /events — internal event ingestion endpoint ─────────────────────────
// In production this is replaced by a Kafka/SQS consumer (task 15).

app.post('/events', async (req: Request, res: Response) => {
  const event = req.body as { type: string; payload: Record<string, unknown> }

  if (event.type === 'post.published') {
    const { postId, channelId, publishedAt, platformPostId } = event.payload as {
      postId: string
      channelId: string
      publishedAt: string
      platformPostId: string
    }
    handlePostPublished({ postId, channelId, publishedAt, platformPostId })
    return res.status(202).json({ accepted: true })
  }

  return res.status(400).json({ error: `Unhandled event type: ${event.type}` })
})

// ─── GET /analytics/dashboard — aggregated metrics ────────────────────────────
// Requirements: 5.5

app.get('/analytics/dashboard', async (req: Request, res: Response) => {
  const { creator_id, range } = req.query as Record<string, string>

  if (!creator_id) {
    return res.status(422).json({ error: 'creator_id is required' })
  }

  const validRanges = ['7', '30', '90']
  if (!range || !validRanges.includes(range)) {
    return res.status(422).json({ error: 'range must be 7, 30, or 90' })
  }

  const days = parseInt(range, 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const posts = await getPublishedPostsByCreator(creator_id, since)
  const metrics = await getMetricsByCreatorAndRange(creator_id, since)

  // Aggregate across all channels — null fields excluded per Req 5.6
  const aggregate = aggregateMetrics(metrics)

  return res.status(200).json({
    creator_id,
    range_days: days,
    since: since.toISOString(),
    post_count: posts.length,
    metrics_count: metrics.length,
    aggregate,
  })
})

// ─── GET /analytics/posts/:postId/metrics ─────────────────────────────────────

app.get('/analytics/posts/:postId/metrics', async (req: Request, res: Response) => {
  const { postId } = req.params
  const metrics = await getMetricsByPostId(postId)
  if (!metrics) {
    return res.status(404).json({ error: 'Metrics not yet available for this post' })
  }
  return res.status(200).json(metrics)
})

// ─── GET /analytics/posts/:postId/insight ─────────────────────────────────────

app.get('/analytics/posts/:postId/insight', async (req: Request, res: Response) => {
  const { postId } = req.params
  const insight = await getInsightByPostId(postId)
  if (!insight) {
    return res.status(404).json({ error: 'Insight not yet available for this post' })
  }
  return res.status(200).json(insight)
})

// ─── GET /analytics/channels/:channelId/recommendation ───────────────────────

app.get('/analytics/channels/:channelId/recommendation', async (req: Request, res: Response) => {
  const { channelId } = req.params
  const recommendation = await generateDoMoreLikeThis(channelId)
  if (!recommendation) {
    return res.status(404).json({ error: 'Not enough published posts to generate a recommendation' })
  }
  return res.status(200).json({ channel_id: channelId, recommendation })
})

// ─── Aggregation helper ───────────────────────────────────────────────────────

function aggregateMetrics(metrics: PostMetrics[]): Record<string, number | null> {
  if (metrics.length === 0) {
    return {
      total_views: null,
      total_likes: null,
      total_comments: null,
      total_shares: null,
      avg_watch_time_seconds: null,
      avg_engagement_rate: null,
    }
  }

  const sumOrNull = (field: keyof PostMetrics): number | null => {
    const values = metrics
      .map((m) => m[field] as number | undefined)
      .filter((v): v is number => v != null)
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null
  }

  const avgOrNull = (field: keyof PostMetrics): number | null => {
    const values = metrics
      .map((m) => m[field] as number | undefined)
      .filter((v): v is number => v != null)
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  return {
    total_views: sumOrNull('views'),
    total_likes: sumOrNull('likes'),
    total_comments: sumOrNull('comments'),
    total_shares: sumOrNull('shares'),
    avg_watch_time_seconds: avgOrNull('watch_time_seconds'),
    avg_engagement_rate: avgOrNull('engagement_rate'),
  }
}

// ─── Health check ─────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'analytics-engine', uptime: process.uptime() })
})

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3006

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`[analytics-engine] listening on port ${PORT}`)
  })
}

export { app }
