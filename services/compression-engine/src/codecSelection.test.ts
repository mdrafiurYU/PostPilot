// Unit tests for codec selection logic
// Feature: post-pilot, Task 3.1

import { describe, it, expect } from 'vitest'
import { selectCodec, PLATFORM_CAPABILITIES } from './codecSelection.js'
import type { PlatformCapabilities, CreatorTier } from './codecSelection.js'

describe('selectCodec', () => {
  it('selects AV1 when platform supports it and creator is PRO', () => {
    const caps: PlatformCapabilities = { supportsAV1: true, supportsH265: true }
    expect(selectCodec(caps, 'pro')).toBe('av1')
  })

  it('selects AV1 when platform supports it and creator is enterprise', () => {
    const caps: PlatformCapabilities = { supportsAV1: true, supportsH265: true }
    expect(selectCodec(caps, 'enterprise')).toBe('av1')
  })

  it('falls back to H.265 when platform supports AV1 but creator is free tier', () => {
    const caps: PlatformCapabilities = { supportsAV1: true, supportsH265: true }
    expect(selectCodec(caps, 'free')).toBe('h265')
  })

  it('selects H.265 when platform supports H.265 but not AV1', () => {
    const caps: PlatformCapabilities = { supportsAV1: false, supportsH265: true }
    expect(selectCodec(caps, 'pro')).toBe('h265')
  })

  it('falls back to H.264 when platform supports neither AV1 nor H.265', () => {
    const caps: PlatformCapabilities = { supportsAV1: false, supportsH265: false }
    expect(selectCodec(caps, 'pro')).toBe('h264')
  })

  it('selects H.264 for free tier on H.264-only platform', () => {
    const caps: PlatformCapabilities = { supportsAV1: false, supportsH265: false }
    expect(selectCodec(caps, 'free')).toBe('h264')
  })

  it('selects H.265 for free tier when platform supports H.265 but not AV1', () => {
    const caps: PlatformCapabilities = { supportsAV1: false, supportsH265: true }
    expect(selectCodec(caps, 'free')).toBe('h265')
  })

  describe('platform presets', () => {
    it('YouTube supports AV1 and H.265', () => {
      expect(PLATFORM_CAPABILITIES['youtube'].supportsAV1).toBe(true)
      expect(PLATFORM_CAPABILITIES['youtube'].supportsH265).toBe(true)
    })

    it('TikTok supports H.265 but not AV1', () => {
      expect(PLATFORM_CAPABILITIES['tiktok'].supportsAV1).toBe(false)
      expect(PLATFORM_CAPABILITIES['tiktok'].supportsH265).toBe(true)
    })

    it('Instagram supports neither AV1 nor H.265', () => {
      expect(PLATFORM_CAPABILITIES['instagram'].supportsAV1).toBe(false)
      expect(PLATFORM_CAPABILITIES['instagram'].supportsH265).toBe(false)
    })

    it('selects H.264 for Instagram regardless of tier', () => {
      const caps = PLATFORM_CAPABILITIES['instagram']
      expect(selectCodec(caps, 'pro')).toBe('h264')
      expect(selectCodec(caps, 'enterprise')).toBe('h264')
      expect(selectCodec(caps, 'free')).toBe('h264')
    })
  })
})
