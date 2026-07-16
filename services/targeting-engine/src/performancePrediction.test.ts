// Unit tests for performancePrediction.ts
// Validates: Requirements 3.5, 3.6

import { describe, it, expect } from 'vitest'
import { generatePrediction } from './performancePrediction.js'
import type { Platform } from '@postpilot/types'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

describe('generatePrediction', () => {
  it('estimated_engagement_rate_low <= estimated_engagement_rate_high always holds', () => {
    const inputs = [
      { postId: 'post-1', platform: 'tiktok' as Platform, postCount: 0 },
      { postId: 'post-2', platform: 'instagram' as Platform, postCount: 5 },
      { postId: 'post-3', platform: 'youtube' as Platform, postCount: 10 },
      { postId: 'post-4', platform: 'linkedin' as Platform, postCount: 50 },
      { postId: 'post-5', platform: 'facebook' as Platform, postCount: 100 },
      { postId: 'abc-xyz', platform: 'tiktok' as Platform, postCount: 9 },
      { postId: 'abc-xyz', platform: 'tiktok' as Platform, postCount: 49 },
    ]
    for (const { postId, platform, postCount } of inputs) {
      const pred = generatePrediction(postId, platform, postCount)
      expect(pred.estimated_engagement_rate_low).toBeLessThanOrEqual(
        pred.estimated_engagement_rate_high
      )
    }
  })

  it('confidence is always one of low | medium | high', () => {
    const validConfidence = new Set(['low', 'medium', 'high'])
    for (const platform of PLATFORMS) {
      for (const postCount of [0, 5, 9, 10, 49, 50, 200]) {
        const pred = generatePrediction('test-post', platform, postCount)
        expect(validConfidence.has(pred.confidence)).toBe(true)
      }
    }
  })

  it('cold-start (post_count < 10) sets data_source to platform_benchmarks', () => {
    for (const platform of PLATFORMS) {
      for (const postCount of [0, 1, 5, 9]) {
        const pred = generatePrediction('cold-post', platform, postCount)
        expect(pred.data_source).toBe('platform_benchmarks')
      }
    }
  })

  it('cold-start (post_count < 10) sets confidence to low', () => {
    for (const platform of PLATFORMS) {
      for (const postCount of [0, 1, 5, 9]) {
        const pred = generatePrediction('cold-post', platform, postCount)
        expect(pred.confidence).toBe('low')
      }
    }
  })

  it('non-cold-start (post_count >= 10) sets data_source to channel_history', () => {
    for (const platform of PLATFORMS) {
      for (const postCount of [10, 25, 49, 50, 100]) {
        const pred = generatePrediction('warm-post', platform, postCount)
        expect(pred.data_source).toBe('channel_history')
      }
    }
  })

  it('post_count 10–49 sets confidence to medium', () => {
    for (const platform of PLATFORMS) {
      for (const postCount of [10, 25, 49]) {
        const pred = generatePrediction('medium-post', platform, postCount)
        expect(pred.confidence).toBe('medium')
      }
    }
  })

  it('post_count >= 50 sets confidence to high', () => {
    for (const platform of PLATFORMS) {
      for (const postCount of [50, 100, 500]) {
        const pred = generatePrediction('high-post', platform, postCount)
        expect(pred.confidence).toBe('high')
      }
    }
  })

  it('generated_at is a valid Date', () => {
    const pred = generatePrediction('date-post', 'tiktok', 0)
    expect(pred.generated_at).toBeInstanceOf(Date)
    expect(pred.generated_at.getTime()).not.toBeNaN()
  })

  it('is deterministic for the same inputs (except generated_at)', () => {
    const pred1 = generatePrediction('det-post', 'instagram', 15)
    const pred2 = generatePrediction('det-post', 'instagram', 15)
    expect(pred1.estimated_engagement_rate_low).toBe(pred2.estimated_engagement_rate_low)
    expect(pred1.estimated_engagement_rate_high).toBe(pred2.estimated_engagement_rate_high)
    expect(pred1.confidence).toBe(pred2.confidence)
    expect(pred1.data_source).toBe(pred2.data_source)
  })

  it('returns correct post_id and platform in the result', () => {
    const pred = generatePrediction('my-post-id', 'linkedin', 20)
    expect(pred.post_id).toBe('my-post-id')
    expect(pred.platform).toBe('linkedin')
  })

  it('engagement rates are realistic (within expected range)', () => {
    for (const platform of PLATFORMS) {
      const pred = generatePrediction('range-post', platform, 0)
      expect(pred.estimated_engagement_rate_low).toBeGreaterThan(0)
      expect(pred.estimated_engagement_rate_high).toBeLessThan(0.15)
    }
  })
})
