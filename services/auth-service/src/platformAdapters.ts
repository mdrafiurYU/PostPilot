// OAuth configuration per platform
// Credentials are read from environment variables at runtime.

import type { Platform } from '@postpilot/types'

export interface PlatformOAuthConfig {
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  clientId: string
  clientSecret: string
}

export function getOAuthConfig(platform: Platform): PlatformOAuthConfig {
  switch (platform) {
    case 'tiktok':
      return {
        authorizationUrl: 'https://www.tiktok.com/auth/authorize/',
        tokenUrl: 'https://open-api.tiktok.com/oauth/access_token/',
        scopes: ['user.info.basic', 'video.list', 'video.upload'],
        clientId: process.env.TIKTOK_CLIENT_ID ?? '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      }

    case 'instagram':
      return {
        authorizationUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
        clientId: process.env.INSTAGRAM_CLIENT_ID ?? '',
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? '',
      }

    case 'youtube':
      return {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
        ],
        clientId: process.env.YOUTUBE_CLIENT_ID ?? '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
      }

    case 'linkedin':
      return {
        authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: ['r_liteprofile', 'w_member_social'],
        clientId: process.env.LINKEDIN_CLIENT_ID ?? '',
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      }

    case 'facebook':
      return {
        authorizationUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'publish_video'],
        clientId: process.env.FACEBOOK_CLIENT_ID ?? '',
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? '',
      }

    default: {
      const _exhaustive: never = platform
      throw new Error(`[platformAdapters] unsupported platform: ${_exhaustive}`)
    }
  }
}
