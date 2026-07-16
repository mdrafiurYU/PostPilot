// PostgreSQL client and data access functions for analytics-engine

import { Pool } from 'pg'
import type { PostMetrics, Insight, InsightFactor, Post, Channel, Platform } from '@postpilot/types'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: parseInt(process.env.PG_POOL_MAX ?? '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000, // 10s for AWS RDS latency
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToPost(row: Record<string, unknown>): Post {
  return {
    id: row.id as string,
    creator_id: row.creator_id as string,
    channel_id: row.channel_id as string,
    asset_id: row.asset_id as string | undefined,
    clip_id: row.clip_id as string | undefined,
    caption_id: row.caption_id as string | undefined,
    batch_id: row.batch_id as string | undefined,
    scheduled_at: row.scheduled_at as Date,
    published_at: row.published_at as Date | undefined,
    platform_post_id: row.platform_post_id as string | undefined,
    status: row.status as Post['status'],
    retry_count: Number(row.retry_count),
    last_error: row.last_error as string | undefined,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function rowToChannel(row: Record<string, unknown>): Channel {
  return {
    id: row.id as string,
    creator_id: row.creator_id as string,
    platform: row.platform as Platform,
    platform_user_id: row.platform_user_id as string,
    platform_username: row.platform_username as string,
    token_vault_key: row.token_vault_key as string,
    token_expires_at: row.token_expires_at as Date,
    status: row.status as Channel['status'],
    post_count: Number(row.post_count),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function rowToPostMetrics(row: Record<string, unknown>): PostMetrics {
  return {
    id: row.id as string,
    post_id: row.post_id as string,
    platform: row.platform as Platform,
    ingested_at: row.ingested_at as Date,
    views: row.views != null ? Number(row.views) : undefined,
    likes: row.likes != null ? Number(row.likes) : undefined,
    comments: row.comments != null ? Number(row.comments) : undefined,
    shares: row.shares != null ? Number(row.shares) : undefined,
    watch_time_seconds: row.watch_time_seconds != null ? Number(row.watch_time_seconds) : undefined,
    engagement_rate: row.engagement_rate != null ? Number(row.engagement_rate) : undefined,
  }
}

// ─── Post queries ─────────────────────────────────────────────────────────────

export async function getPostById(id: string): Promise<Post | null> {
  const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToPost(result.rows[0])
}

export async function getPublishedPostsByChannel(channelId: string, since?: Date): Promise<Post[]> {
  if (since) {
    const result = await pool.query(
      "SELECT * FROM posts WHERE channel_id = $1 AND status = 'published' AND published_at >= $2 ORDER BY published_at DESC",
      [channelId, since],
    )
    return result.rows.map(rowToPost)
  }
  const result = await pool.query(
    "SELECT * FROM posts WHERE channel_id = $1 AND status = 'published' ORDER BY published_at DESC",
    [channelId],
  )
  return result.rows.map(rowToPost)
}

export async function getPublishedPostsByCreator(creatorId: string, since: Date): Promise<Post[]> {
  const result = await pool.query(
    "SELECT * FROM posts WHERE creator_id = $1 AND status = 'published' AND published_at >= $2 ORDER BY published_at DESC",
    [creatorId, since],
  )
  return result.rows.map(rowToPost)
}

// ─── Channel queries ──────────────────────────────────────────────────────────

export async function getChannelById(id: string): Promise<Channel | null> {
  const result = await pool.query('SELECT * FROM channels WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToChannel(result.rows[0])
}

// ─── PostMetrics queries ──────────────────────────────────────────────────────

export async function insertPostMetrics(metrics: PostMetrics): Promise<PostMetrics> {
  const result = await pool.query(
    `INSERT INTO post_metrics
      (id, post_id, platform, ingested_at, views, likes, comments, shares, watch_time_seconds, engagement_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      metrics.id,
      metrics.post_id,
      metrics.platform,
      metrics.ingested_at,
      metrics.views ?? null,
      metrics.likes ?? null,
      metrics.comments ?? null,
      metrics.shares ?? null,
      metrics.watch_time_seconds ?? null,
      metrics.engagement_rate ?? null,
    ],
  )
  return rowToPostMetrics(result.rows[0])
}

export async function getMetricsByPostId(postId: string): Promise<PostMetrics | null> {
  const result = await pool.query('SELECT * FROM post_metrics WHERE post_id = $1', [postId])
  if (result.rows.length === 0) return null
  return rowToPostMetrics(result.rows[0])
}

export async function getMetricsByCreatorAndRange(
  creatorId: string,
  since: Date,
): Promise<PostMetrics[]> {
  const result = await pool.query(
    `SELECT pm.* FROM post_metrics pm
     JOIN posts p ON p.id = pm.post_id
     WHERE p.creator_id = $1 AND pm.ingested_at >= $2`,
    [creatorId, since],
  )
  return result.rows.map(rowToPostMetrics)
}

// ─── Insight queries ──────────────────────────────────────────────────────────

export async function insertInsight(
  insight: Omit<Insight, 'factors'> & { factors: InsightFactor[] },
): Promise<Insight> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const insightResult = await client.query(
      `INSERT INTO insights (id, post_id, creator_id, channel_id, recommendation, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        insight.id,
        insight.post_id,
        insight.creator_id,
        insight.channel_id,
        insight.recommendation ?? null,
        insight.generated_at,
      ],
    )

    for (const factor of insight.factors) {
      await client.query(
        `INSERT INTO insight_factors (id, insight_id, label, description, impact, magnitude)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          crypto.randomUUID(),
          insightResult.rows[0].id,
          factor.label,
          factor.description,
          factor.impact,
          factor.magnitude,
        ],
      )
    }

    await client.query('COMMIT')

    return {
      id: insightResult.rows[0].id as string,
      post_id: insightResult.rows[0].post_id as string,
      creator_id: insightResult.rows[0].creator_id as string,
      channel_id: insightResult.rows[0].channel_id as string,
      factors: insight.factors,
      recommendation: insightResult.rows[0].recommendation as string | undefined,
      generated_at: insightResult.rows[0].generated_at as Date,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getInsightByPostId(postId: string): Promise<Insight | null> {
  const insightResult = await pool.query('SELECT * FROM insights WHERE post_id = $1', [postId])
  if (insightResult.rows.length === 0) return null

  const row = insightResult.rows[0]
  const factorsResult = await pool.query('SELECT * FROM insight_factors WHERE insight_id = $1', [
    row.id,
  ])

  return {
    id: row.id as string,
    post_id: row.post_id as string,
    creator_id: row.creator_id as string,
    channel_id: row.channel_id as string,
    factors: factorsResult.rows.map((f) => ({
      label: f.label as string,
      description: f.description as string,
      impact: f.impact as InsightFactor['impact'],
      magnitude: f.magnitude as InsightFactor['magnitude'],
    })),
    recommendation: row.recommendation as string | undefined,
    generated_at: row.generated_at as Date,
  }
}
