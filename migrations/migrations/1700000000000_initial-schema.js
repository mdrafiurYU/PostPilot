/**
 * Initial schema migration for PostPilot.
 * Creates all core entity tables.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ─── Enable UUID extension ───────────────────────────────────────────────
  pgm.createExtension('pgcrypto', { ifNotExists: true })

  // ─── assets ─────────────────────────────────────────────────────────────
  pgm.createTable('assets', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    creator_id: { type: 'uuid', notNull: true },
    filename: { type: 'text', notNull: true },
    media_type: { type: 'text', notNull: true }, // 'video' | 'image'
    format: { type: 'text', notNull: true }, // 'mp4' | 'mov' | 'webm' | 'jpeg' | 'png' | 'gif'
    file_size_bytes: { type: 'bigint', notNull: true },
    duration_seconds: { type: 'numeric' },
    s3_key: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: "'uploading'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('assets', 'creator_id')
  pgm.createIndex('assets', 'status')

  // ─── renditions ─────────────────────────────────────────────────────────
  pgm.createTable('renditions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    asset_id: {
      type: 'uuid',
      notNull: true,
      references: '"assets"',
      onDelete: 'CASCADE',
    },
    codec: { type: 'text', notNull: true }, // 'h264' | 'h265' | 'av1'
    resolution: { type: 'text', notNull: true }, // '360p' | '720p' | '1080p' | 'source'
    width: { type: 'integer', notNull: true },
    height: { type: 'integer', notNull: true },
    bitrate_kbps: { type: 'integer', notNull: true },
    vmaf_score: { type: 'numeric', notNull: true },
    file_size_bytes: { type: 'bigint', notNull: true },
    s3_key: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('renditions', 'asset_id')

  // ─── adaptations ────────────────────────────────────────────────────────
  pgm.createTable('adaptations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    asset_id: {
      type: 'uuid',
      notNull: true,
      references: '"assets"',
      onDelete: 'CASCADE',
    },
    platform: { type: 'text', notNull: true },
    format_variant: { type: 'text', notNull: true },
    aspect_ratio: { type: 'text', notNull: true },
    codec: { type: 'text', notNull: true },
    s3_key: { type: 'text', notNull: true },
    manifest_s3_key: { type: 'text' },
    status: { type: 'text', notNull: true, default: "'pending'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('adaptations', 'asset_id')
  pgm.createIndex('adaptations', ['asset_id', 'platform'])

  // ─── clips ──────────────────────────────────────────────────────────────
  pgm.createTable('clips', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    asset_id: {
      type: 'uuid',
      notNull: true,
      references: '"assets"',
      onDelete: 'CASCADE',
    },
    start_seconds: { type: 'numeric', notNull: true },
    end_seconds: { type: 'numeric', notNull: true },
    duration_seconds: { type: 'numeric', notNull: true },
    engagement_score: { type: 'numeric', notNull: true },
    s3_key: { type: 'text', notNull: true },
    subtitles_s3_key: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('clips', 'asset_id')

  // ─── captions ───────────────────────────────────────────────────────────
  pgm.createTable('captions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    clip_id: {
      type: 'uuid',
      references: '"clips"',
      onDelete: 'SET NULL',
    },
    asset_id: {
      type: 'uuid',
      notNull: true,
      references: '"assets"',
      onDelete: 'CASCADE',
    },
    platform: { type: 'text', notNull: true },
    text: { type: 'text', notNull: true },
    character_count: { type: 'integer', notNull: true },
    hashtags: { type: 'text[]', notNull: true, default: "'{}'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('captions', 'asset_id')
  pgm.createIndex('captions', 'clip_id')

  // ─── channels ───────────────────────────────────────────────────────────
  pgm.createTable('channels', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    creator_id: { type: 'uuid', notNull: true },
    platform: { type: 'text', notNull: true },
    platform_user_id: { type: 'text', notNull: true },
    platform_username: { type: 'text', notNull: true },
    token_vault_key: { type: 'text', notNull: true },
    token_expires_at: { type: 'timestamptz', notNull: true },
    status: { type: 'text', notNull: true, default: "'active'" },
    post_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('channels', 'creator_id')
  pgm.createIndex('channels', ['creator_id', 'platform'])
  pgm.addConstraint('channels', 'channels_platform_user_unique', 'UNIQUE (platform, platform_user_id)')

  // ─── posts ──────────────────────────────────────────────────────────────
  pgm.createTable('posts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    creator_id: { type: 'uuid', notNull: true },
    channel_id: {
      type: 'uuid',
      notNull: true,
      references: '"channels"',
      onDelete: 'RESTRICT',
    },
    asset_id: {
      type: 'uuid',
      references: '"assets"',
      onDelete: 'SET NULL',
    },
    clip_id: {
      type: 'uuid',
      references: '"clips"',
      onDelete: 'SET NULL',
    },
    caption_id: {
      type: 'uuid',
      references: '"captions"',
      onDelete: 'SET NULL',
    },
    batch_id: { type: 'uuid' },
    scheduled_at: { type: 'timestamptz', notNull: true },
    published_at: { type: 'timestamptz' },
    platform_post_id: { type: 'text' },
    status: { type: 'text', notNull: true, default: "'draft'" },
    retry_count: { type: 'integer', notNull: true, default: 0 },
    last_error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('posts', 'creator_id')
  pgm.createIndex('posts', 'channel_id')
  pgm.createIndex('posts', 'batch_id')
  pgm.createIndex('posts', ['status', 'scheduled_at'])

  // ─── batches ────────────────────────────────────────────────────────────
  pgm.createTable('batches', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    creator_id: { type: 'uuid', notNull: true },
    name: { type: 'text', notNull: true },
    post_ids: { type: 'uuid[]', notNull: true, default: "'{}'" },
    status: { type: 'text', notNull: true, default: "'draft'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('batches', 'creator_id')

  // ─── post_metrics ────────────────────────────────────────────────────────
  pgm.createTable('post_metrics', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    post_id: {
      type: 'uuid',
      notNull: true,
      references: '"posts"',
      onDelete: 'CASCADE',
    },
    platform: { type: 'text', notNull: true },
    ingested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    views: { type: 'bigint' },
    likes: { type: 'bigint' },
    comments: { type: 'bigint' },
    shares: { type: 'bigint' },
    watch_time_seconds: { type: 'bigint' },
    engagement_rate: { type: 'numeric' },
  })
  pgm.createIndex('post_metrics', 'post_id')

  // ─── insights ────────────────────────────────────────────────────────────
  pgm.createTable('insights', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    post_id: {
      type: 'uuid',
      notNull: true,
      references: '"posts"',
      onDelete: 'CASCADE',
    },
    creator_id: { type: 'uuid', notNull: true },
    channel_id: {
      type: 'uuid',
      notNull: true,
      references: '"channels"',
      onDelete: 'CASCADE',
    },
    recommendation: { type: 'text' },
    generated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('insights', 'post_id')
  pgm.createIndex('insights', 'creator_id')

  // ─── insight_factors ─────────────────────────────────────────────────────
  pgm.createTable('insight_factors', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    insight_id: {
      type: 'uuid',
      notNull: true,
      references: '"insights"',
      onDelete: 'CASCADE',
    },
    label: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true },
    impact: { type: 'text', notNull: true }, // 'positive' | 'negative'
    magnitude: { type: 'text', notNull: true }, // 'low' | 'medium' | 'high'
  })
  pgm.createIndex('insight_factors', 'insight_id')
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('insight_factors')
  pgm.dropTable('insights')
  pgm.dropTable('post_metrics')
  pgm.dropTable('batches')
  pgm.dropTable('posts')
  pgm.dropTable('channels')
  pgm.dropTable('captions')
  pgm.dropTable('clips')
  pgm.dropTable('adaptations')
  pgm.dropTable('renditions')
  pgm.dropTable('assets')
}
