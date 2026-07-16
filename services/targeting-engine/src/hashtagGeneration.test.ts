// Unit tests for hashtag generation logic
// Feature: post-pilot, Property 5: Hashtag suggestion structure

import { describe, it, expect } from 'vitest'
import {
  generateHashtagSuggestions,
  classifyVolumeTier,
  simulatePostCount,
  computeReachScore,
  hashString,
} from './hashtagGeneration.js'
import type { Platform } from '@postpilot/types'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

describe('hashString', () => {
  it('returns a number in [0, 1)', () => {
    const result = hashString('test')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(1)
  })

  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'))
  })

  it('produces different values for different inputs', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'))
  })
})

describe('classifyVolumeTier', () => {
  it('classifies >1M as high', () => {
    expect(classifyVolumeTier(1_000_001)).toBe('high')
    expect(classifyVolumeTier(50_000_000)).toBe('high')
  })

  it('classifies 100K–1M as mid', () => {
    expect(classifyVolumeTier(100_000)).toBe('mid')
    expect(classifyVolumeTier(999_999)).toBe('mid')
    expect(classifyVolumeTier(500_000)).toBe('mid')
  })

  it('classifies <100K as niche', () => {
    expect(classifyVolumeTier(99_999)).toBe('niche')
    expect(classifyVolumeTier(1_000)).toBe('niche')
    expect(classifyVolumeTier(0)).toBe('niche')
  })

  it('classifies exactly 1M as mid (boundary)', () => {
    expect(classifyVolumeTier(1_000_000)).toBe('mid')
  })
})

describe('simulatePostCount', () => {
  it('returns a positive integer', () => {
    const count = simulatePostCount('fyp', 'tiktok')
    expect(count).toBeGreaterThan(0)
    expect(Number.isInteger(count)).toBe(true)
  })

  it('is deterministic', () => {
    expect(simulatePostCount('viral', 'instagram')).toBe(simulatePostCount('viral', 'instagram'))
  })

  it('varies by platform', () => {
    const tiktok = simulatePostCount('viral', 'tiktok')
    const linkedin = simulatePostCount('viral', 'linkedin')
    // Different platforms should produce different counts for the same hashtag
    expect(tiktok).not.toBe(linkedin)
  })
})

describe('computeReachScore', () => {
  it('returns a score in [0, 100]', () => {
    for (const platform of PLATFORMS) {
      const score = computeReachScore('fyp', platform)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic', () => {
    expect(computeReachScore('trending', 'tiktok')).toBe(computeReachScore('trending', 'tiktok'))
  })
})

describe('generateHashtagSuggestions', () => {
  it('returns between 5 and 30 hashtags (Req 3.1)', () => {
    for (const platform of PLATFORMS) {
      const suggestions = generateHashtagSuggestions('post-123', platform)
      expect(suggestions.length).toBeGreaterThanOrEqual(5)
      expect(suggestions.length).toBeLessThanOrEqual(30)
    }
  })

  it('each hashtag has a valid volume_tier (Req 3.2)', () => {
    const suggestions = generateHashtagSuggestions('post-abc', 'tiktok')
    for (const s of suggestions) {
      expect(['high', 'mid', 'niche']).toContain(s.volume_tier)
    }
  })

  it('is sorted by predicted_reach_score descending (Req 3.1)', () => {
    for (const platform of PLATFORMS) {
      const suggestions = generateHashtagSuggestions('post-xyz', platform)
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].predicted_reach_score).toBeGreaterThanOrEqual(
          suggestions[i].predicted_reach_score
        )
      }
    }
  })

  it('assigns sequential ranks starting at 1', () => {
    const suggestions = generateHashtagSuggestions('post-rank-test', 'instagram')
    suggestions.forEach((s, i) => {
      expect(s.rank).toBe(i + 1)
    })
  })

  it('all hashtags have the correct platform set', () => {
    for (const platform of PLATFORMS) {
      const suggestions = generateHashtagSuggestions('post-platform-test', platform)
      for (const s of suggestions) {
        expect(s.platform).toBe(platform)
      }
    }
  })

  it('predicted_reach_score is in [0, 100]', () => {
    const suggestions = generateHashtagSuggestions('post-score-test', 'youtube')
    for (const s of suggestions) {
      expect(s.predicted_reach_score).toBeGreaterThanOrEqual(0)
      expect(s.predicted_reach_score).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic — same inputs produce same output', () => {
    const a = generateHashtagSuggestions('post-det', 'linkedin')
    const b = generateHashtagSuggestions('post-det', 'linkedin')
    expect(a).toEqual(b)
  })

  it('different post IDs produce different hashtag sets', () => {
    const a = generateHashtagSuggestions('post-aaa', 'tiktok')
    const b = generateHashtagSuggestions('post-bbb', 'tiktok')
    // At least the ordering or selection should differ
    const aHashtags = a.map((s) => s.hashtag).join(',')
    const bHashtags = b.map((s) => s.hashtag).join(',')
    expect(aHashtags).not.toBe(bHashtags)
  })

  it('volume_tier matches the simulated post count classification', () => {
    const suggestions = generateHashtagSuggestions('post-tier-check', 'facebook')
    for (const s of suggestions) {
      const postCount = simulatePostCount(s.hashtag, s.platform)
      const expectedTier = classifyVolumeTier(postCount)
      expect(s.volume_tier).toBe(expectedTier)
    }
  })
})
