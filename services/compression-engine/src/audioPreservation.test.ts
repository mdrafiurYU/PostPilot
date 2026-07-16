// Unit tests for audio preservation logic
// Feature: post-pilot, Task 3.12

import { describe, it, expect } from 'vitest'
import {
  buildAudioArgs,
  getAudioConfig,
  AUDIO_BITRATE_KBPS,
} from './audioPreservation.js'
import type { AudioChannelLayout, QualityTier } from './audioPreservation.js'

describe('AUDIO_BITRATE_KBPS', () => {
  it('standard quality uses 128 kbps', () => {
    expect(AUDIO_BITRATE_KBPS['standard']).toBe(128)
  })

  it('high quality uses 192 kbps', () => {
    expect(AUDIO_BITRATE_KBPS['high']).toBe(192)
  })

  it('low quality uses 128 kbps', () => {
    expect(AUDIO_BITRATE_KBPS['low']).toBe(128)
  })
})

describe('buildAudioArgs', () => {
  it('includes AAC codec and aac_low profile', () => {
    const args = buildAudioArgs('stereo', 'standard')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).toContain('-profile:a')
    expect(args).toContain('aac_low')
  })

  it('sets 128k bitrate for standard quality', () => {
    const args = buildAudioArgs('stereo', 'standard')
    expect(args).toContain('-b:a')
    expect(args).toContain('128k')
  })

  it('sets 192k bitrate for high quality', () => {
    const args = buildAudioArgs('stereo', 'high')
    expect(args).toContain('192k')
  })

  it('preserves mono channel layout', () => {
    const args = buildAudioArgs('mono', 'standard')
    expect(args).toContain('-ac')
    expect(args).toContain('1')
  })

  it('preserves stereo channel layout', () => {
    const args = buildAudioArgs('stereo', 'standard')
    expect(args).toContain('-ac')
    expect(args).toContain('2')
  })

  it('preserves 5.1 channel layout', () => {
    const args = buildAudioArgs('5.1', 'standard')
    expect(args).toContain('-ac')
    expect(args).toContain('6')
  })
})

describe('getAudioConfig', () => {
  it('returns correct config for stereo standard', () => {
    const config = getAudioConfig('stereo', 'standard')
    expect(config.channelLayout).toBe('stereo')
    expect(config.bitrate_kbps).toBe(128)
    expect(config.codec).toBe('aac')
    expect(config.profile).toBe('aac_low')
  })

  it('returns correct config for 5.1 high quality', () => {
    const config = getAudioConfig('5.1', 'high')
    expect(config.channelLayout).toBe('5.1')
    expect(config.bitrate_kbps).toBe(192)
  })

  it('preserves source channel layout in config', () => {
    const layouts: AudioChannelLayout[] = ['mono', 'stereo', '5.1']
    for (const layout of layouts) {
      const config = getAudioConfig(layout, 'standard')
      expect(config.channelLayout).toBe(layout)
    }
  })
})
