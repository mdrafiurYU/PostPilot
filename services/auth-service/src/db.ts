// PostgreSQL data access for channels, posts, and users

import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import type { Channel, Post, Platform } from '@postpilot/types'

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
  // Enable SSL in production (AWS RDS requires SSL)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

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

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    password_hash: row.password_hash as string,
    name: row.name as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

// ─── users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  password_hash: string
  name: string | null
  created_at: Date
  updated_at: Date
}

export async function insertUser(user: User): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user.id, user.email, user.password_hash, user.name, user.created_at, user.updated_at],
  )
  return rowToUser(result.rows[0])
}

export async function createUserWithEmail(
  email: string,
  password: string,
  name?: string | null,
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 10) // 10 rounds
  const id = crypto.randomUUID()
  const now = new Date()
  return insertUser({
    id,
    email,
    password_hash: passwordHash,
    name: name ?? null,
    created_at: now,
    updated_at: now,
  })
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  if (result.rows.length === 0) return null
  return rowToUser(result.rows[0])
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToUser(result.rows[0])
}

// ─── channels ─────────────────────────────────────────────────────────────────

export async function insertChannel(channel: Channel): Promise<Channel> {
  const result = await pool.query(
    `INSERT INTO channels
      (id, creator_id, platform, platform_user_id, platform_username,
       token_vault_key, token_expires_at, status, post_count, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      channel.id,
      channel.creator_id,
      channel.platform,
      channel.platform_user_id,
      channel.platform_username,
      channel.token_vault_key,
      channel.token_expires_at,
      channel.status,
      channel.post_count,
      channel.created_at,
      channel.updated_at,
    ],
  )
  return rowToChannel(result.rows[0])
}

export async function getChannelById(id: string): Promise<Channel | null> {
  const result = await pool.query('SELECT * FROM channels WHERE id = $1', [id])
  if (result.rows.length === 0) return null
  return rowToChannel(result.rows[0])
}

export async function getChannelsByCreatorAndPlatform(
  creatorId: string,
  platform: Platform,
): Promise<Channel[]> {
  const result = await pool.query(
    "SELECT * FROM channels WHERE creator_id = $1 AND platform = $2 AND status != 'disconnected'",
    [creatorId, platform],
  )
  return result.rows.map(rowToChannel)
}

export async function updateChannelStatus(id: string, status: Channel['status']): Promise<void> {
  await pool.query('UPDATE channels SET status = $1, updated_at = NOW() WHERE id = $2', [
    status,
    id,
  ])
}

export async function updateChannelTokenExpiry(id: string, tokenExpiresAt: Date): Promise<void> {
  await pool.query('UPDATE channels SET token_expires_at = $1, updated_at = NOW() WHERE id = $2', [
    tokenExpiresAt,
    id,
  ])
}

export async function getChannelsExpiringBefore(cutoff: Date): Promise<Channel[]> {
  const result = await pool.query(
    "SELECT * FROM channels WHERE token_expires_at < $1 AND status = 'active'",
    [cutoff],
  )
  return result.rows.map(rowToChannel)
}

export async function getDraftAndScheduledPostsByChannel(channelId: string): Promise<Post[]> {
  const result = await pool.query(
    "SELECT * FROM posts WHERE channel_id = $1 AND status IN ('draft', 'scheduled')",
    [channelId],
  )
  return result.rows.map(rowToPost)
}

export async function cancelPostsByChannel(channelId: string): Promise<void> {
  await pool.query(
    "UPDATE posts SET status = 'cancelled', updated_at = NOW() WHERE channel_id = $1 AND status IN ('draft', 'scheduled')",
    [channelId],
  )
}

// Alias: suspendPostsByChannel sets draft/scheduled posts to 'cancelled'
export async function suspendPostsByChannel(channelId: string): Promise<void> {
  await cancelPostsByChannel(channelId)
}
