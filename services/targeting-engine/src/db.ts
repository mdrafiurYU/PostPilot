// Database access for the Targeting Engine

import { Pool } from 'pg'
import type { Channel, HashtagSuggestion, Platform } from '@postpilot/types'

export interface PostRow {
  id: string
  channel_id: string
}

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

export async function getChannel(channelId: string): Promise<Channel | null> {
  const result = await pool.query<Channel>(
    `SELECT id, creator_id, platform, platform_user_id, platform_username,
            token_vault_key, token_expires_at, status, post_count, created_at, updated_at
     FROM channels
     WHERE id = $1`,
    [channelId],
  )
  return result.rows[0] ?? null
}

export interface HashtagSuggestionRow {
  id: string
  post_id: string
  hashtag: string
  platform: Platform
  volume_tier: 'high' | 'mid' | 'niche'
  predicted_reach_score: number
  rank: number
  created_at: Date
}

export async function upsertHashtagSuggestions(
  postId: string,
  suggestions: HashtagSuggestion[],
): Promise<void> {
  // Delete existing suggestions for this post+platform combination
  if (suggestions.length === 0) return

  const platform = suggestions[0].platform

  await pool.query('DELETE FROM hashtag_suggestions WHERE post_id = $1 AND platform = $2', [
    postId,
    platform,
  ])

  for (const s of suggestions) {
    await pool.query(
      `INSERT INTO hashtag_suggestions
        (id, post_id, hashtag, platform, volume_tier, predicted_reach_score, rank, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        crypto.randomUUID(),
        postId,
        s.hashtag,
        s.platform,
        s.volume_tier,
        s.predicted_reach_score,
        s.rank,
      ],
    )
  }
}

export async function getPost(postId: string): Promise<PostRow | null> {
  const result = await pool.query<PostRow>('SELECT id, channel_id FROM posts WHERE id = $1', [
    postId,
  ])
  return result.rows[0] ?? null
}

export async function getHashtagSuggestions(
  postId: string,
  platform: Platform,
): Promise<HashtagSuggestion[]> {
  const result = await pool.query<HashtagSuggestionRow>(
    `SELECT hashtag, platform, volume_tier, predicted_reach_score, rank
     FROM hashtag_suggestions
     WHERE post_id = $1 AND platform = $2
     ORDER BY predicted_reach_score DESC`,
    [postId, platform],
  )
  return result.rows.map((row) => ({
    hashtag: row.hashtag,
    platform: row.platform,
    volume_tier: row.volume_tier,
    predicted_reach_score: row.predicted_reach_score,
    rank: row.rank,
  }))
}
