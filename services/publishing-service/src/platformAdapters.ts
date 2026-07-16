import { createLogger } from '@postpilot/logger'
const logger = createLogger('publishing-service')

// Platform adapters for publishing posts to social media platforms
// Each adapter implements the PlatformAdapter interface for a specific platform.

import type { Post, Channel, Platform } from '@postpilot/types'

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

export interface PublishResult {
  platformPostId: string
  publishedAt: Date
}

export interface PlatformMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  watch_time_seconds?: number
  engagement_rate?: number
}

export interface PlatformAdapter {
  publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult>
  refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens>
  revokeToken(channel: Channel, accessToken: string): Promise<void>
  getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics>
}

// ─── TikTok Adapter ────────────────────────────────────────────────────────

class TikTokAdapter implements PlatformAdapter {
  async publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult> {
    // Production: POST https://open-api.tiktok.com/share/video/upload/
    logger.info(`[publishing-service] TikTok publishPost: post=${post.id} channel=${channel.id}`)
    return {
      platformPostId: `tiktok_${crypto.randomUUID()}`,
      publishedAt: new Date(),
    }
  }

  async refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens> {
    // Production: POST https://open-api.tiktok.com/oauth/refresh_token/
    logger.info(`[publishing-service] TikTok refreshToken: channel=${channel.id}`)
    return {
      access_token: `tiktok_access_${crypto.randomUUID()}`,
      refresh_token: `tiktok_refresh_${crypto.randomUUID()}`,
      expires_at: Date.now() + 3600 * 1000,
    }
  }

  async revokeToken(channel: Channel, accessToken: string): Promise<void> {
    // Production: POST https://open-api.tiktok.com/oauth/revoke/
    logger.info(`[publishing-service] TikTok revokeToken: channel=${channel.id}`)
  }

  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://open-api.tiktok.com/video/query/
    logger.info(`[publishing-service] TikTok getMetrics: post=${post.id}`)
    return { views: 0, likes: 0, comments: 0, shares: 0, watch_time_seconds: 0, engagement_rate: 0 }
  }
}

// ─── Instagram Adapter ─────────────────────────────────────────────────────

class InstagramAdapter implements PlatformAdapter {
  async publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult> {
    // Production: POST https://graph.facebook.com/v18.0/{ig-user-id}/media + publish
    logger.info(`[publishing-service] Instagram publishPost: post=${post.id} channel=${channel.id}`)
    return {
      platformPostId: `instagram_${crypto.randomUUID()}`,
      publishedAt: new Date(),
    }
  }

  async refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens> {
    // Production: GET https://graph.facebook.com/v18.0/oauth/access_token (long-lived token exchange)
    logger.info(`[publishing-service] Instagram refreshToken: channel=${channel.id}`)
    return {
      access_token: `instagram_access_${crypto.randomUUID()}`,
      refresh_token: `instagram_refresh_${crypto.randomUUID()}`,
      expires_at: Date.now() + 3600 * 1000,
    }
  }

  async revokeToken(channel: Channel, accessToken: string): Promise<void> {
    // Production: DELETE https://graph.facebook.com/v18.0/me/permissions
    logger.info(`[publishing-service] Instagram revokeToken: channel=${channel.id}`)
  }

  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://graph.facebook.com/v18.0/{media-id}/insights
    logger.info(`[publishing-service] Instagram getMetrics: post=${post.id}`)
    return { views: 0, likes: 0, comments: 0, shares: 0, engagement_rate: 0 }
  }
}

// ─── YouTube Adapter ───────────────────────────────────────────────────────

class YouTubeAdapter implements PlatformAdapter {
  async publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult> {
    // Production: POST https://www.googleapis.com/upload/youtube/v3/videos
    logger.info(`[publishing-service] YouTube publishPost: post=${post.id} channel=${channel.id}`)
    return {
      platformPostId: `youtube_${crypto.randomUUID()}`,
      publishedAt: new Date(),
    }
  }

  async refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens> {
    // Production: POST https://oauth2.googleapis.com/token with grant_type=refresh_token
    logger.info(`[publishing-service] YouTube refreshToken: channel=${channel.id}`)
    return {
      access_token: `youtube_access_${crypto.randomUUID()}`,
      refresh_token: `youtube_refresh_${crypto.randomUUID()}`,
      expires_at: Date.now() + 3600 * 1000,
    }
  }

  async revokeToken(channel: Channel, accessToken: string): Promise<void> {
    // Production: POST https://oauth2.googleapis.com/revoke?token={accessToken}
    logger.info(`[publishing-service] YouTube revokeToken: channel=${channel.id}`)
  }

  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://www.googleapis.com/youtube/v3/videos?part=statistics
    logger.info(`[publishing-service] YouTube getMetrics: post=${post.id}`)
    return { views: 0, likes: 0, comments: 0, watch_time_seconds: 0, engagement_rate: 0 }
  }
}

// ─── LinkedIn Adapter ──────────────────────────────────────────────────────

class LinkedInAdapter implements PlatformAdapter {
  async publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult> {
    // Production: POST https://api.linkedin.com/v2/ugcPosts
    logger.info(`[publishing-service] LinkedIn publishPost: post=${post.id} channel=${channel.id}`)
    return {
      platformPostId: `linkedin_${crypto.randomUUID()}`,
      publishedAt: new Date(),
    }
  }

  async refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens> {
    // Production: POST https://www.linkedin.com/oauth/v2/accessToken with grant_type=refresh_token
    logger.info(`[publishing-service] LinkedIn refreshToken: channel=${channel.id}`)
    return {
      access_token: `linkedin_access_${crypto.randomUUID()}`,
      refresh_token: `linkedin_refresh_${crypto.randomUUID()}`,
      expires_at: Date.now() + 3600 * 1000,
    }
  }

  async revokeToken(channel: Channel, accessToken: string): Promise<void> {
    // Production: DELETE https://api.linkedin.com/v2/oauth2/authorization
    logger.info(`[publishing-service] LinkedIn revokeToken: channel=${channel.id}`)
  }

  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://api.linkedin.com/v2/organizationalEntityShareStatistics
    logger.info(`[publishing-service] LinkedIn getMetrics: post=${post.id}`)
    return { views: 0, likes: 0, comments: 0, shares: 0, engagement_rate: 0 }
  }
}

// ─── Facebook Adapter ──────────────────────────────────────────────────────

class FacebookAdapter implements PlatformAdapter {
  async publishPost(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PublishResult> {
    // Production: POST https://graph.facebook.com/v18.0/{page-id}/videos or /feed
    logger.info(`[publishing-service] Facebook publishPost: post=${post.id} channel=${channel.id}`)
    return {
      platformPostId: `facebook_${crypto.randomUUID()}`,
      publishedAt: new Date(),
    }
  }

  async refreshToken(channel: Channel, refreshToken: string): Promise<OAuthTokens> {
    // Production: GET https://graph.facebook.com/v18.0/oauth/access_token (long-lived token)
    logger.info(`[publishing-service] Facebook refreshToken: channel=${channel.id}`)
    return {
      access_token: `facebook_access_${crypto.randomUUID()}`,
      refresh_token: `facebook_refresh_${crypto.randomUUID()}`,
      expires_at: Date.now() + 3600 * 1000,
    }
  }

  async revokeToken(channel: Channel, accessToken: string): Promise<void> {
    // Production: DELETE https://graph.facebook.com/v18.0/me/permissions
    logger.info(`[publishing-service] Facebook revokeToken: channel=${channel.id}`)
  }

  async getMetrics(post: Post, channel: Channel, tokens: OAuthTokens): Promise<PlatformMetrics> {
    // Production: GET https://graph.facebook.com/v18.0/{post-id}/insights
    logger.info(`[publishing-service] Facebook getMetrics: post=${post.id}`)
    return { views: 0, likes: 0, comments: 0, shares: 0, engagement_rate: 0 }
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

const adapters: Record<Platform, PlatformAdapter> = {
  tiktok: new TikTokAdapter(),
  instagram: new InstagramAdapter(),
  youtube: new YouTubeAdapter(),
  linkedin: new LinkedInAdapter(),
  facebook: new FacebookAdapter(),
}

export function getPlatformAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform]
  if (!adapter) {
    throw new Error(`[platformAdapters] unsupported platform: ${platform}`)
  }
  return adapter
}
