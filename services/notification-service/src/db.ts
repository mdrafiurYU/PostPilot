// PostgreSQL client and data access for notification-service

import { Pool } from 'pg'

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

export type NotificationType =
  | 'asset_ready'
  | 'post_published'
  | 'post_failed'
  | 'quality_shortfall'
  | 'reauth_required'
export type NotificationChannel = 'in_app' | 'push' | 'email'

export interface Notification {
  id: string
  creator_id: string
  type: NotificationType
  channel: NotificationChannel
  title: string
  body: string
  metadata: Record<string, unknown>
  read: boolean
  created_at: Date
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    creator_id: row.creator_id as string,
    type: row.type as NotificationType,
    channel: row.channel as NotificationChannel,
    title: row.title as string,
    body: row.body as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    read: row.read as boolean,
    created_at: row.created_at as Date,
  }
}

export async function insertNotification(
  notification: Omit<Notification, 'read' | 'created_at'>,
): Promise<Notification> {
  const result = await pool.query(
    `INSERT INTO notifications (id, creator_id, type, channel, title, body, metadata, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
     RETURNING *`,
    [
      notification.id,
      notification.creator_id,
      notification.type,
      notification.channel,
      notification.title,
      notification.body,
      JSON.stringify(notification.metadata),
    ],
  )
  return rowToNotification(result.rows[0])
}

export async function getNotificationsByCreator(creatorId: string): Promise<Notification[]> {
  const result = await pool.query(
    'SELECT * FROM notifications WHERE creator_id = $1 ORDER BY created_at DESC',
    [creatorId],
  )
  return result.rows.map(rowToNotification)
}

export async function markNotificationRead(id: string): Promise<void> {
  await pool.query('UPDATE notifications SET read = true WHERE id = $1', [id])
}
