// Platform variant definitions for the Transcoder
// Requirements: 1.4, 1.5

import type { Platform } from '@postpilot/types'

export type Codec = 'h264' | 'av1'

export interface PlatformVariant {
  platform: Platform
  /** e.g. 'reels', 'feed', 'watch' */
  formatVariant: string
  aspectRatio: string
  width: number
  height: number
  codec: Codec
}

/**
 * The 7 canonical platform format variants.
 * TikTok 9:16, Instagram Reels 9:16, Instagram Feed 1:1,
 * YouTube 16:9 (H.264 default; AV1 optional), LinkedIn 1:1,
 * Facebook Reels 9:16, Facebook Watch 16:9.
 *
 * Requirements: 1.4, 1.5
 */
export const PLATFORM_VARIANTS: PlatformVariant[] = [
  {
    platform: 'tiktok',
    formatVariant: 'reels',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    codec: 'h264',
  },
  {
    platform: 'instagram',
    formatVariant: 'reels',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    codec: 'h264',
  },
  {
    platform: 'instagram',
    formatVariant: 'feed',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    codec: 'h264',
  },
  {
    platform: 'youtube',
    formatVariant: 'watch',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    codec: 'h264',
  },
  {
    platform: 'linkedin',
    formatVariant: 'feed',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    codec: 'h264',
  },
  {
    platform: 'facebook',
    formatVariant: 'reels',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    codec: 'h264',
  },
  {
    platform: 'facebook',
    formatVariant: 'watch',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    codec: 'h264',
  },
]
