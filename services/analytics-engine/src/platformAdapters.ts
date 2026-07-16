import { createLogger } from '@postpilot/logger'
const logger = createLogger('analytics-engine')

// Platform adapter interface and implementations for analytics metric fetching.
// Mirrors the PlatformAdapter interface from publishing-service.

import type { Post, Channel, Platform } from '@postpilot/types'
import type { OAuthTokens } from './vault.js'

export interface PlatformMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  watch_time_seconds?: number
  engagement_rate?: number
}

export interface AnalyticsAdapter {
  getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics>
}

// ─── Per-platform stubs ───────────────────────────────────────────────────────

class TikTokAnalyticsAdapter implements AnalyticsAdapter {
  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://open-api.tiktok.com/video/query/
    logger.info(`[analytics-engine] TikTok getMetrics: post=${post.id}`)
    return { views: undefined, likes: undefined, comments: undefined, shares: undefined, watch_time_seconds: undefined, engagement_rate: undefined }
  }
}

class InstagramAnalyticsAdapter implements AnalyticsAdapter {
  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://graph.facebook.com/v18.0/{media-id}/insights
    logger.info(`[analytics-engine] Instagram getMetrics: post=${post.id}`)
    return { views: undefined, likes: undefined, comments: undefined, shares: undefined, engagement_rate: undefined }
  }
}

class YouTubeAnalyticsAdapter implements AnalyticsAdapter {
  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://www.googleapis.com/youtube/v3/videos?part=statistics
    logger.info(`[analytics-engine] YouTube getMetrics: post=${post.id}`)
    return { views: undefined, likes: undefined, comments: undefined, watch_time_seconds: undefined, engagement_rate: undefined }
  }
}

class LinkedInAnalyticsAdapter implements AnalyticsAdapter {
  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://api.linkedin.com/v2/organizationalEntityShareStatistics
    logger.info(`[analytics-engine] LinkedIn getMetrics: post=${post.id}`)
    return { views: undefined, likes: undefined, comments: undefined, shares: undefined, engagement_rate: undefined }
  }
}

class FacebookAnalyticsAdapter implements AnalyticsAdapter {
  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://graph.facebook.com/v18.0/{post-id}/insights
    logger.info(`[analytics-engine] Facebook getMetrics: post=${post.id}`)
    return { views: undefined, likes: undefined, comments: undefined, shares: undefined, engagement_rate: undefined }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const adapters: Record<Platform, AnalyticsAdapter> = {
  tiktok: new TikTokAnalyticsAdapter(),
  instagram: new InstagramAnalyticsAdapter(),
  youtube: new YouTubeAnalyticsAdapter(),
  linkedin: new LinkedInAnalyticsAdapter(),
  facebook: new FacebookAnalyticsAdapter(),
}

export function getAnalyticsAdapter(platform: Platform): AnalyticsAdapter {
  const adapter = adapters[platform]
  if (!adapter) {
    throw new Error(`[analytics-engine] unsupported platform: ${platform}`)
  }
  return adapter
}
