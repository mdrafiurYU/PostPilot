// PostgreSQL client and data access functions

import { Pool } from 'pg'
import type { Asset, AssetStatus, Adaptation } from '@postpilot/types'

type AssetRow = {
  id: string
  creator_id: string
  filename: string
  media_type: 'video' | 'image'
  format: 'mp4' | 'mov' | 'webm' | 'jpeg' | 'png' | 'gif'
  file_size_bytes: number
  duration_seconds?: number
  s3_key: string
  status: AssetStatus
  created_at: Date
  updated_at: Date
  deleted_at?: Date
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

function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    creator_id: row.creator_id,
    filename: row.filename,
    media_type: row.media_type,
    format: row.format,
    file_size_bytes: Number(row.file_size_bytes),
    duration_seconds: row.duration_seconds,
    s3_key: row.s3_key,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function insertAsset(asset: Asset): Promise<Asset> {
  const result = await pool.query<AssetRow>(
    `INSERT INTO assets
      (id, creator_id, filename, media_type, format, file_size_bytes, duration_seconds, s3_key, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      asset.id,
      asset.creator_id,
      asset.filename,
      asset.media_type,
      asset.format,
      asset.file_size_bytes,
      asset.duration_seconds ?? null,
      asset.s3_key,
      asset.status,
      asset.created_at,
      asset.updated_at,
    ],
  )
  return rowToAsset(result.rows[0])
}

export async function getAssetById(id: string): Promise<Asset | null> {
  const result = await pool.query<AssetRow>(
    'SELECT * FROM assets WHERE id = $1 AND deleted_at IS NULL',
    [id],
  )
  if (result.rows.length === 0) return null
  return rowToAsset(result.rows[0])
}

export async function updateAssetStatus(id: string, status: AssetStatus): Promise<void> {
  await pool.query('UPDATE assets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
}

export async function getAdaptationsByAssetId(id: string): Promise<Adaptation[]> {
  const result = await pool.query<Adaptation>('SELECT * FROM adaptations WHERE asset_id = $1', [id])
  return result.rows
}

export async function softDeleteAsset(id: string): Promise<void> {
  await pool.query('UPDATE assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id])
}
