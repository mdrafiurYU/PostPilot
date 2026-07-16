// @postpilot/events — message bus event schemas

import type {
  Adaptation,
  Clip,
  Caption,
  HashtagSuggestion,
  Platform,
  Rendition,
} from '@postpilot/types'

// ─── Base event envelope ───────────────────────────────────────────────────

export interface BaseEvent {
  eventId: string
  occurredAt: string // ISO-8601
}

// ─── Asset events ──────────────────────────────────────────────────────────

export interface AssetUploadedEvent extends BaseEvent {
  type: 'asset.uploaded'
  payload: {
    assetId: string
    creatorId: string
    s3Key: string
    mediaType: 'video' | 'image'
    format: 'mp4' | 'mov' | 'webm' | 'jpeg' | 'png' | 'gif'
    fileSizeBytes: number
  }
}

export interface AssetCompressedEvent extends BaseEvent {
  type: 'asset.compressed'
  payload: {
    assetId: string
    renditions: Rendition[]
  }
}

export interface AssetAdaptedEvent extends BaseEvent {
  type: 'asset.adapted'
  payload: {
    assetId: string
    adaptations: Adaptation[]
  }
}

export interface AssetRepurposedEvent extends BaseEvent {
  type: 'asset.repurposed'
  payload: {
    assetId: string
    clips: Clip[]
    captions: Caption[]
  }
}

export interface AssetQualityShortfallEvent extends BaseEvent {
  type: 'asset.quality_shortfall'
  payload: {
    assetId: string
    renditionId: string
    targetVmaf: number
    achievedVmaf: number
  }
}

// ─── Targeting events ──────────────────────────────────────────────────────

export interface TargetingReadyEvent extends BaseEvent {
  type: 'targeting.ready'
  payload: {
    assetId: string
    postId: string
    hashtags: HashtagSuggestion[]
    timingSlots: Array<{
      scheduledAt: string // ISO-8601
      predictedEngagementScore: number
    }>
  }
}

// ─── Post events ───────────────────────────────────────────────────────────

export interface PostScheduledEvent extends BaseEvent {
  type: 'post.scheduled'
  payload: {
    postId: string
    channelId: string
    scheduledAt: string // ISO-8601
  }
}

export interface PostPublishedEvent extends BaseEvent {
  type: 'post.published'
  payload: {
    postId: string
    channelId: string
    publishedAt: string // ISO-8601
    platformPostId: string
  }
}

export interface PostFailedEvent extends BaseEvent {
  type: 'post.failed'
  payload: {
    postId: string
    channelId: string
    error: string
    retryCount: number
  }
}

// ─── Channel events ────────────────────────────────────────────────────────

export interface ChannelTokenExpiredEvent extends BaseEvent {
  type: 'channel.token_expired'
  payload: {
    channelId: string
    creatorId: string
    platform: Platform
  }
}

// ─── Union type ────────────────────────────────────────────────────────────

export type PostPilotEvent =
  | AssetUploadedEvent
  | AssetCompressedEvent
  | AssetAdaptedEvent
  | AssetRepurposedEvent
  | AssetQualityShortfallEvent
  | TargetingReadyEvent
  | PostScheduledEvent
  | PostPublishedEvent
  | PostFailedEvent
  | ChannelTokenExpiredEvent

// ─── Topic names ───────────────────────────────────────────────────────────

export const TOPICS = {
  ASSET_UPLOADED: 'asset.uploaded',
  ASSET_COMPRESSED: 'asset.compressed',
  ASSET_ADAPTED: 'asset.adapted',
  ASSET_REPURPOSED: 'asset.repurposed',
  ASSET_QUALITY_SHORTFALL: 'asset.quality_shortfall',
  TARGETING_READY: 'targeting.ready',
  POST_SCHEDULED: 'post.scheduled',
  POST_PUBLISHED: 'post.published',
  POST_FAILED: 'post.failed',
  CHANNEL_TOKEN_EXPIRED: 'channel.token_expired',
} as const

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS]

// Queue-friendly aliases — identical values, clearer naming for queue consumers
export const QUEUES = TOPICS
export type QueueName = TopicName
