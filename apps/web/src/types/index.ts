// Re-export all shared types from the backend package — single source of truth.
// Frontend-specific types are defined below.
export type {
  Platform,
  AssetStatus,
  PostStatus,
  Asset,
  Rendition,
  Adaptation,
  Caption,
  Clip,
  Channel,
  Post,
  Batch,
  PostMetrics,
  InsightFactor,
  Insight,
  HashtagSuggestion,
  PerformancePrediction,
} from '@postpilot/types'

// ─── Frontend-only types ──────────────────────────────────────────────────────

export interface UploadState {
  file: File
  progress: number // 0–100
  assetId?: string
  error?: string
}

export interface NotificationMessage {
  id: string
  type:
    | 'asset_ready'
    | 'asset_failed'
    | 'post_published'
    | 'post_failed'
    | 'token_expired'
    | 'quality_shortfall'
  message: string
  resource_type?: 'asset' | 'post' | 'channel'
  resource_id?: string
  created_at: string
  read: boolean
}

export interface DashboardMetrics {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  watch_time_seconds: number | null
  engagement_rate: number | null
  date_range: '7d' | '30d' | '90d'
}

export interface TimingSlot {
  scheduled_at: string // ISO 8601
  predicted_engagement_score: number
  rank: number
}

export interface TrendItem {
  title: string
  platform: import('@postpilot/types').Platform
  category: string
  rank: number
}
