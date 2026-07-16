// Codec selection logic for the Compression Engine
// Implements AV1 → H.265 → H.264 preference cascade based on platform capabilities and creator tier

export type Codec = 'h264' | 'h265' | 'av1'
export type CreatorTier = 'free' | 'pro' | 'enterprise'

export interface PlatformCapabilities {
  supportsAV1: boolean
  supportsH265: boolean
}

/**
 * Select the best codec based on platform capabilities and creator tier.
 *
 * Logic:
 *   if platform supports AV1 AND creator.tier >= PRO → AV1
 *   elif platform supports H.265 → H.265
 *   else → H.264
 *
 * Requirements: 7.1, 7.2
 */
export function selectCodec(
  platformCapabilities: PlatformCapabilities,
  creatorTier: CreatorTier
): Codec {
  const tierAllowsAV1 = creatorTier === 'pro' || creatorTier === 'enterprise'

  if (platformCapabilities.supportsAV1 && tierAllowsAV1) {
    return 'av1'
  }

  if (platformCapabilities.supportsH265) {
    return 'h265'
  }

  return 'h264'
}

/**
 * Platform capability presets for known platforms.
 */
export const PLATFORM_CAPABILITIES: Record<string, PlatformCapabilities> = {
  youtube: { supportsAV1: true, supportsH265: true },
  tiktok: { supportsAV1: false, supportsH265: true },
  instagram: { supportsAV1: false, supportsH265: false },
  facebook: { supportsAV1: false, supportsH265: false },
  linkedin: { supportsAV1: false, supportsH265: false },
}
