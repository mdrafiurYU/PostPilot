// Unit tests for HLS/DASH manifest generation
// Feature: post-pilot, Task 3.10

import { describe, it, expect } from 'vitest'
import {
  generateHlsManifest,
  generateDashManifest,
  countHlsRenditionRefs,
  countDashRenditionRefs,
} from './manifestGeneration.js'
import type { Rendition } from '@postpilot/types'

function makeRendition(overrides: Partial<Rendition> = {}): Rendition {
  return {
    id: crypto.randomUUID(),
    asset_id: 'asset-1',
    codec: 'h264',
    resolution: '720p',
    width: 1280,
    height: 720,
    bitrate_kbps: 2500,
    vmaf_score: 90,
    file_size_bytes: 50_000_000,
    s3_key: 'assets/asset-1/renditions/720p_h264.mp4',
    created_at: new Date(),
    ...overrides,
  }
}

const THREE_RENDITIONS: Rendition[] = [
  makeRendition({ resolution: '360p', height: 360, width: 640, bitrate_kbps: 800, s3_key: 'assets/asset-1/renditions/360p_h264.mp4' }),
  makeRendition({ resolution: '720p', height: 720, width: 1280, bitrate_kbps: 2500, s3_key: 'assets/asset-1/renditions/720p_h264.mp4' }),
  makeRendition({ resolution: '1080p', height: 1080, width: 1920, bitrate_kbps: 5000, s3_key: 'assets/asset-1/renditions/1080p_h264.mp4' }),
]

describe('generateHlsManifest', () => {
  it('starts with #EXTM3U header', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    expect(manifest).toMatch(/^#EXTM3U/)
  })

  it('contains exactly N EXT-X-STREAM-INF entries for N renditions', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    expect(countHlsRenditionRefs(manifest)).toBe(3)
  })

  it('references each rendition s3_key', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    for (const r of THREE_RENDITIONS) {
      expect(manifest).toContain(r.s3_key)
    }
  })

  it('includes BANDWIDTH attribute for each rendition', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    expect(manifest).toContain('BANDWIDTH=800000')
    expect(manifest).toContain('BANDWIDTH=2500000')
    expect(manifest).toContain('BANDWIDTH=5000000')
  })

  it('includes RESOLUTION attribute', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    expect(manifest).toContain('RESOLUTION=640x360')
    expect(manifest).toContain('RESOLUTION=1280x720')
  })

  it('handles empty rendition list', () => {
    const manifest = generateHlsManifest([])
    expect(countHlsRenditionRefs(manifest)).toBe(0)
    expect(manifest).toContain('#EXTM3U')
  })

  it('handles single rendition', () => {
    const manifest = generateHlsManifest([THREE_RENDITIONS[0]])
    expect(countHlsRenditionRefs(manifest)).toBe(1)
  })

  it('uses correct codec string for h265', () => {
    const r = makeRendition({ codec: 'h265' })
    const manifest = generateHlsManifest([r])
    expect(manifest).toContain('hvc1')
  })

  it('uses correct codec string for av1', () => {
    const r = makeRendition({ codec: 'av1' })
    const manifest = generateHlsManifest([r])
    expect(manifest).toContain('av01')
  })
})

describe('generateDashManifest', () => {
  it('is valid XML starting with XML declaration', () => {
    const manifest = generateDashManifest(THREE_RENDITIONS)
    expect(manifest).toMatch(/^<\?xml/)
  })

  it('contains exactly N Representation elements for N renditions', () => {
    const manifest = generateDashManifest(THREE_RENDITIONS)
    expect(countDashRenditionRefs(manifest)).toBe(3)
  })

  it('references each rendition s3_key as BaseURL', () => {
    const manifest = generateDashManifest(THREE_RENDITIONS)
    for (const r of THREE_RENDITIONS) {
      expect(manifest).toContain(r.s3_key)
    }
  })

  it('handles empty rendition list', () => {
    const manifest = generateDashManifest([])
    expect(countDashRenditionRefs(manifest)).toBe(0)
  })
})

describe('countHlsRenditionRefs', () => {
  it('returns 0 for empty manifest', () => {
    expect(countHlsRenditionRefs('#EXTM3U\n')).toBe(0)
  })

  it('counts correctly for known manifest', () => {
    const manifest = generateHlsManifest(THREE_RENDITIONS)
    expect(countHlsRenditionRefs(manifest)).toBe(THREE_RENDITIONS.length)
  })
})
