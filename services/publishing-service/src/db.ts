// PostgreSQL client and data access functions for publishing-service

import { Pool } from 'pg'
import type { Post, PostStatus, Batch, Channel, Platform } from '@postpilot/types'

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
    status: row.status as PostStatus,
    retry_count: Number(row.retry_count),
    last_error: row.last_error as string | undefined,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function rowToBatch(row: Record<string, unknown>): Batch {
  return {
    id: row.id as string,
    creator_id: row.creator_id as string,
    name: row.name as string,
    post_ids: row.post_ids as string[],
    status: row.status as Batch['status'],
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

// ─── Post functions ────────────────────────────────────────────────────────

export async function insertPost(post: Post): Promise<Post> {
  const result = await pool.query(
    `INSERT INTO posts
      (id, creator_id, channel_id, asset_id, clip_id, caption_id, batch_id,
       scheduled_at, published_at, platform_post_id, status, retry_count, last_error, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      post.id,
      post.creator_id,
      post.channel_id,
      post.asset_id ?? null,
      post.clip_id ?? null,
      post.caption_id ?? null,
      post.batch_id ?? null,
      post.scheduled_at,
      post.published_at ?? null,
      post.platform_post_id ?? null,
      post.status,
      post.retry_count,
      post.last_error ?? null,
      post.created_at,
      post.updated_at,
    ],
  )
  return rowToPost(result.rows[0])
}

export async function getPostById(id: string): Promise<Post | null> {
  const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToPost(result.rows[0])
}

export async function updatePostStatus(
  id: string,
  status: PostStatus,
  extra?: Partial<Post>,
): Promise<void> {
  const fields: string[] = ['status = $1', 'updated_at = NOW()']
  const values: unknown[] = [status]
  let idx = 2

  if (extra?.published_at !== undefined) {
    fields.push(`published_at = $${idx++}`)
    values.push(extra.published_at)
  }
  if (extra?.platform_post_id !== undefined) {
    fields.push(`platform_post_id = $${idx++}`)
    values.push(extra.platform_post_id)
  }
  if (extra?.retry_count !== undefined) {
    fields.push(`retry_count = $${idx++}`)
    values.push(extra.retry_count)
  }
  if (extra?.last_error !== undefined) {
    fields.push(`last_error = $${idx++}`)
    values.push(extra.last_error)
  }
  if (extra?.scheduled_at !== undefined) {
    fields.push(`scheduled_at = $${idx++}`)
    values.push(extra.scheduled_at)
  }

  values.push(id)
  await pool.query(`UPDATE posts SET ${fields.join(', ')} WHERE id = $${idx}`, values)
}

export async function getScheduledPostsDue(cutoff: Date): Promise<Post[]> {
  const result = await pool.query(
    "SELECT * FROM posts WHERE scheduled_at <= $1 AND status = 'scheduled'",
    [cutoff],
  )
  return result.rows.map(rowToPost)
}

// ─── Batch functions ───────────────────────────────────────────────────────

export async function insertBatch(batch: Batch): Promise<Batch> {
  const result = await pool.query(
    `INSERT INTO batches
      (id, creator_id, name, post_ids, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      batch.id,
      batch.creator_id,
      batch.name,
      batch.post_ids,
      batch.status,
      batch.created_at,
      batch.updated_at,
    ],
  )
  return rowToBatch(result.rows[0])
}

export async function getBatchById(id: string): Promise<Batch | null> {
  const result = await pool.query('SELECT * FROM batches WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToBatch(result.rows[0])
}

export async function updateBatchStatus(id: string, status: Batch['status']): Promise<void> {
  await pool.query('UPDATE batches SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
}

// ─── Channel functions ─────────────────────────────────────────────────────

export async function getChannelById(id: string): Promise<Channel | null> {
  const result = await pool.query('SELECT * FROM channels WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToChannel(result.rows[0])
}

export async function updateChannelStatus(id: string, status: Channel['status']): Promise<void> {
  await pool.query('UPDATE channels SET status = $1, updated_at = NOW() WHERE id = $2', [
    status,
    id,
  ])
}

export async function cancelPostsByChannel(channelId: string): Promise<void> {
  await pool.query(
    "UPDATE posts SET status = 'cancelled', updated_at = NOW() WHERE channel_id = $1 AND status IN ('draft', 'scheduled')",
    [channelId],
  )
}
