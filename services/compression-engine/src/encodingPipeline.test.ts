// Unit tests for encoding pipeline (bitrate ladder, content-aware encoding)
// Feature: post-pilot, Task 3.3

import { describe, it, expect } from 'vitest'
import {
  adjustBitrateForContent,
  RENDITION_SPECS,
} from './encodingPipeline.js'
import type { ContentAnalysis } from './encodingPipeline.js'

describe('RENDITION_SPECS', () => {
  it('has at least 3 renditions', () => {
    expect(RENDITION_SPECS.length).toBeGreaterThanOrEqual(3)
  })

  it('includes 360p (low tier)', () => {
    const spec = RENDITION_SPECS.find((s) => s.resolution === '360p')
    expect(spec).toBeDefined()
    expect(spec?.qualityTier).toBe('low')
  })

  it('includes 720p (standard tier)', () => {
    const spec = RENDITION_SPECS.find((s) => s.resolution === '720p')
    expect(spec).toBeDefined()
    expect(spec?.qualityTier).toBe('standard')
  })

  it('includes 1080p (high tier)', () => {
    const spec = RENDITION_SPECS.find((s) => s.resolution === '1080p')
    expect(spec).toBeDefined()
    expect(spec?.qualityTier).toBe('high')
  })

  it('renditions are ordered by height ascending', () => {
    const heights = RENDITION_SPECS.map((s) => s.height)
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1])
    }
  })
})

describe('adjustBitrateForContent', () => {
  const neutralAnalysis: ContentAnalysis = {
    sceneComplexity: 0.5,
    motionLevel: 0.5,
    grainLevel: 0.3,
  }

  it('returns a positive bitrate', () => {
    const result = adjustBitrateForContent(2500, neutralAnalysis)
    expect(result).toBeGreaterThan(0)
  })

  it('returns higher bitrate for high complexity content', () => {
    const highComplexity: ContentAnalysis = { sceneComplexity: 1.0, motionLevel: 1.0, grainLevel: 1.0 }
    const lowComplexity: ContentAnalysis = { sceneComplexity: 0.0, motionLevel: 0.0, grainLevel: 0.0 }
    const high = adjustBitrateForContent(2500, highComplexity)
    const low = adjustBitrateForContent(2500, lowComplexity)
    expect(high).toBeGreaterThan(low)
  })

  it('returns lower bitrate for static content', () => {
    const static_: ContentAnalysis = { sceneComplexity: 0.0, motionLevel: 0.0, grainLevel: 0.0 }
    const result = adjustBitrateForContent(2500, static_)
    expect(result).toBeLessThan(2500)
  })

  it('returns integer bitrate', () => {
    const result = adjustBitrateForContent(2500, neutralAnalysis)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('scales proportionally with base bitrate', () => {
    const r1 = adjustBitrateForContent(1000, neutralAnalysis)
    const r2 = adjustBitrateForContent(2000, neutralAnalysis)
    // r2 should be approximately 2x r1
    expect(r2 / r1).toBeCloseTo(2, 0)
  })
})
