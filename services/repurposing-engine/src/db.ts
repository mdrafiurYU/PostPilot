// Database access for the Repurposing Engine

import { Pool } from 'pg'
import type { Clip, Caption } from '@postpilot/types'

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

export async function insertClip(clip: Clip): Promise<Clip> {
  const result = await pool.query<Clip>(
    `INSERT INTO clips
      (id, asset_id, start_seconds, end_seconds, duration_seconds, engagement_score, s3_key, subtitles_s3_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      clip.id,
      clip.asset_id,
      clip.start_seconds,
      clip.end_seconds,
      clip.duration_seconds,
      clip.engagement_score,
      clip.s3_key,
      clip.subtitles_s3_key ?? null,
      clip.created_at,
    ],
  )
  return result.rows[0]
}

export async function getClipsByAssetId(assetId: string): Promise<Clip[]> {
  const result = await pool.query<Clip>(
    'SELECT * FROM clips WHERE asset_id = $1 ORDER BY start_seconds ASC',
    [assetId],
  )
  return result.rows
}

export async function insertCaption(caption: Caption): Promise<Caption> {
  const result = await pool.query<Caption>(
    `INSERT INTO captions
      (id, clip_id, asset_id, platform, text, character_count, hashtags, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      caption.id,
      caption.clip_id ?? null,
      caption.asset_id,
      caption.platform,
      caption.text,
      caption.character_count,
      JSON.stringify(caption.hashtags),
      caption.created_at,
    ],
  )
  return result.rows[0]
}

export async function updateClipSubtitlesKey(
  clipId: string,
  subtitlesS3Key: string,
): Promise<void> {
  await pool.query('UPDATE clips SET subtitles_s3_key = $1 WHERE id = $2', [subtitlesS3Key, clipId])
}
