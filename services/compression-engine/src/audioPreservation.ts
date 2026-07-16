// Audio preservation logic for the Compression Engine
// Preserves source audio channel layout and encodes at correct bitrates
// Requirements: 7.11

export type AudioChannelLayout = 'mono' | 'stereo' | '5.1'
export type QualityTier = 'low' | 'standard' | 'high'

/** AAC-LC bitrate in kbps per quality tier */
export const AUDIO_BITRATE_KBPS: Record<QualityTier, number> = {
  low: 128,       // low uses standard bitrate
  standard: 128,
  high: 192,
}

export interface AudioConfig {
  channelLayout: AudioChannelLayout
  bitrate_kbps: number
  codec: 'aac'
  profile: 'aac_low' // AAC-LC
}

/**
 * Build FFmpeg audio arguments that preserve the source channel layout
 * and apply the correct bitrate for the quality tier.
 */
export function buildAudioArgs(
  sourceChannelLayout: AudioChannelLayout,
  qualityTier: QualityTier
): string[] {
  const bitrate = AUDIO_BITRATE_KBPS[qualityTier]
  const channelArgs = channelLayoutToFFmpegArgs(sourceChannelLayout)

  return [
    '-c:a', 'aac',
    '-profile:a', 'aac_low',
    '-b:a', `${bitrate}k`,
    ...channelArgs,
  ]
}

/**
 * Map a channel layout to FFmpeg channel filter arguments.
 */
function channelLayoutToFFmpegArgs(layout: AudioChannelLayout): string[] {
  switch (layout) {
    case 'mono':
      return ['-ac', '1']
    case 'stereo':
      return ['-ac', '2']
    case '5.1':
      return ['-ac', '6']
  }
}

/**
 * Derive the AudioConfig for a given source layout and quality tier.
 */
export function getAudioConfig(
  sourceChannelLayout: AudioChannelLayout,
  qualityTier: QualityTier
): AudioConfig {
  return {
    channelLayout: sourceChannelLayout,
    bitrate_kbps: AUDIO_BITRATE_KBPS[qualityTier],
    codec: 'aac',
    profile: 'aac_low',
  }
}
