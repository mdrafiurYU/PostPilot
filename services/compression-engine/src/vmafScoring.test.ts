// Unit tests for VMAF scoring and quality gate
// Feature: post-pilot, Task 3.5

import { describe, it, expect } from 'vitest'
import {
  checkVmafThreshold,
  recordQualityShortfall,
  VMAF_THRESHOLDS,
} from './vmafScoring.js'

describe('VMAF_THRESHOLDS', () => {
  it('standard quality threshold is 85', () => {
    expect(VMAF_THRESHOLDS['standard']).toBe(85)
  })

  it('high quality threshold is 93', () => {
    expect(VMAF_THRESHOLDS['high']).toBe(93)
  })

  it('low quality threshold is 85', () => {
    expect(VMAF_THRESHOLDS['low']).toBe(85)
  })
})

describe('checkVmafThreshold', () => {
  it('passes when score equals threshold', () => {
    expect(checkVmafThreshold(85, 'standard')).toBe(true)
    expect(checkVmafThreshold(93, 'high')).toBe(true)
  })

  it('passes when score exceeds threshold', () => {
    expect(checkVmafThreshold(90, 'standard')).toBe(true)
    expect(checkVmafThreshold(95, 'high')).toBe(true)
  })

  it('fails when score is below threshold', () => {
    expect(checkVmafThreshold(84.9, 'standard')).toBe(false)
    expect(checkVmafThreshold(92.9, 'high')).toBe(false)
  })

  it('fails for low quality below 85', () => {
    expect(checkVmafThreshold(80, 'low')).toBe(false)
  })
})

describe('recordQualityShortfall', () => {
  it('returns shortfall record with correct fields', () => {
    const shortfall = recordQualityShortfall('asset-1', 'rendition-1', 80, 'standard')
    expect(shortfall.assetId).toBe('asset-1')
    expect(shortfall.renditionId).toBe('rendition-1')
    expect(shortfall.achievedVmaf).toBe(80)
    expect(shortfall.targetVmaf).toBe(85)
    expect(shortfall.qualityTier).toBe('standard')
  })

  it('uses correct target VMAF for high quality', () => {
    const shortfall = recordQualityShortfall('asset-2', 'rendition-2', 90, 'high')
    expect(shortfall.targetVmaf).toBe(93)
    expect(shortfall.achievedVmaf).toBe(90)
  })
})
