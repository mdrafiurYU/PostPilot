// Database access for the Transcoder

import { Pool } from 'pg'
import type { Asset, AssetStatus, Adaptation } from '@postpilot/types'

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

export async function getAssetById(id: string): Promise<Asset | null> {
  const result = await pool.query<Asset>(
    'SELECT * FROM assets WHERE id = $1 AND deleted_at IS NULL',
    [id],
  )
  return result.rows[0] ?? null
}

export async function updateAssetStatus(id: string, status: AssetStatus): Promise<void> {
  await pool.query('UPDATE assets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
}

export async function upsertAdaptation(adaptation: Adaptation): Promise<void> {
  await pool.query(
    `INSERT INTO adaptations
      (id, asset_id, platform, format_variant, aspect_ratio, codec, s3_key, manifest_s3_key, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       s3_key = EXCLUDED.s3_key,
       status = EXCLUDED.status`,
    [
      adaptation.id,
      adaptation.asset_id,
      adaptation.platform,
      adaptation.format_variant,
      adaptation.aspect_ratio,
      adaptation.codec,
      adaptation.s3_key,
      adaptation.manifest_s3_key ?? null,
      adaptation.status,
      adaptation.created_at,
    ],
  )
}
