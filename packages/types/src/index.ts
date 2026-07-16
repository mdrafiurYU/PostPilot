// @postpilot/types — shared data model interfaces

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'linkedin' | 'facebook'

export type AssetStatus =
  | 'uploading'
  | 'uploaded'
  | 'compressing'
  | 'compressed'
  | 'adapting'
  | 'adapted'
  | 'repurposing'
  | 'ready'
  | 'failed'

export interface Asset {
  id: string
  creator_id: string
  filename: string
  media_type: 'video' | 'image'
  format: 'mp4' | 'mov' | 'webm' | 'jpeg' | 'png' | 'gif'
  file_size_bytes: number
  duration_seconds?: number
  s3_key: string
  status: AssetStatus
  failure_reason?: string
  created_at: Date
  updated_at: Date
}

export interface Rendition {
  id: string
  asset_id: string
  codec: 'h264' | 'h265' | 'av1'
  resolution: '360p' | '720p' | '1080p' | 'source'
  width: number
  height: number
  bitrate_kbps: number
  vmaf_score: number
  file_size_bytes: number
  s3_key: string
  created_at: Date
}

export interface Adaptation {
  id: string
  asset_id: string
  platform: Platform
  format_variant: string
  aspect_ratio: string
  codec: string
  s3_key: string
  manifest_s3_key?: string
  status: 'pending' | 'ready' | 'failed'
  created_at: Date
}

export interface Caption {
  id: string
  clip_id?: string
  asset_id: string
  platform: Platform
  text: string
  character_count: number
  hashtags: string[]
  created_at: Date
}

export interface Clip {
  id: string
  asset_id: string
  start_seconds: number
  end_seconds: number
  duration_seconds: number
  engagement_score: number
  s3_key: string
  captions: Caption[]
  subtitles_s3_key?: string
  created_at: Date
}

export interface Channel {
  id: string
  creator_id: string
  platform: Platform
  platform_user_id: string
  platform_username: string
  token_vault_key: string
  token_expires_at: Date
  status: 'active' | 'token_expired' | 'disconnected'
  post_count: number
  created_at: Date
  updated_at: Date
}

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'

export interface Post {
  id: string
  creator_id: string
  channel_id: string
  channel?: Channel
  asset_id?: string
  clip_id?: string
  caption_id?: string
  batch_id?: string
  scheduled_at: Date
  published_at?: Date
  platform_post_id?: string
  status: PostStatus
  retry_count: number
  last_error?: string
  created_at: Date
  updated_at: Date
}

export interface Batch {
  id: string
  creator_id: string
  name: string
  post_ids: string[]
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'partial_failure'
  created_at: Date
  updated_at: Date
}

export interface PostMetrics {
  id: string
  post_id: string
  platform: Platform
  ingested_at: Date
  views?: number
  likes?: number
  comments?: number
  shares?: number
  watch_time_seconds?: number
  engagement_rate?: number
}

export interface InsightFactor {
  label: string
  description: string
  impact: 'positive' | 'negative'
  magnitude: 'low' | 'medium' | 'high'
}

export interface Insight {
  id: string
  post_id: string
  creator_id: string
  channel_id: string
  factors: InsightFactor[]
  recommendation?: string
  generated_at: Date
}

export interface HashtagSuggestion {
  hashtag: string
  platform: Platform
  volume_tier: 'high' | 'mid' | 'niche'
  predicted_reach_score: number
  rank: number
}

export interface PerformancePrediction {
  post_id: string
  platform: Platform
  estimated_engagement_rate_low: number
  estimated_engagement_rate_high: number
  confidence: 'low' | 'medium' | 'high'
  data_source: 'channel_history' | 'platform_benchmarks'
  generated_at: Date
}
