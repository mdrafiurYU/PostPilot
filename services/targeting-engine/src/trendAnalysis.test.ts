// Unit tests for trendAnalysis.ts
// Requirements: 3.4

import { describe, it, expect, beforeEach } from 'vitest'
import { getTrends, generateTrends, trendCache } from './trendAnalysis.js'
import type { Platform } from '@postpilot/types'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

describe('generateTrends', () => {
  it('returns exactly 10 entries', () => {
    for (const platform of PLATFORMS) {
      const trends = generateTrends(platform, 'fitness')
      expect(trends).toHaveLength(10)
    }
  })

  it('all entries have valid type (topic or audio_track)', () => {
    const trends = generateTrends('tiktok', 'comedy')
    for (const entry of trends) {
      expect(['topic', 'audio_track']).toContain(entry.type)
    }
  })

  it('all entries have trend_score in [0, 100]', () => {
    const trends = generateTrends('instagram', 'tech')
    for (const entry of trends) {
      expect(entry.trend_score).toBeGreaterThanOrEqual(0)
      expect(entry.trend_score).toBeLessThanOrEqual(100)
    }
  })

  it('all entries have the correct platform', () => {
    for (const platform of PLATFORMS) {
      const trends = generateTrends(platform, 'lifestyle')
      for (const entry of trends) {
        expect(entry.platform).toBe(platform)
      }
    }
  })

  it('all entries have the correct category', () => {
    const category = 'cooking'
    const trends = generateTrends('youtube', category)
    for (const entry of trends) {
      expect(entry.category).toBe(category)
    }
  })

  it('is deterministic — same inputs produce same output', () => {
    const first = generateTrends('linkedin', 'business')
    const second = generateTrends('linkedin', 'business')
    expect(first).toEqual(second)
  })

  it('different categories produce different results', () => {
    const fitness = generateTrends('tiktok', 'fitness')
    const comedy = generateTrends('tiktok', 'comedy')
    // At least some entries should differ
    const fitnessTopics = fitness.map((e) => e.topic)
    const comedyTopics = comedy.map((e) => e.topic)
    expect(fitnessTopics).not.toEqual(comedyTopics)
  })
})

describe('getTrends — caching behaviour', () => {
  beforeEach(() => {
    trendCache.clear()
  })

  it('returns exactly 10 entries', () => {
    const trends = getTrends('tiktok', 'fitness')
    expect(trends).toHaveLength(10)
  })

  it('uses cache when < 6 hours old (calling twice returns same reference)', () => {
    const first = getTrends('instagram', 'travel')
    const second = getTrends('instagram', 'travel')
    // Same array reference means cache was hit
    expect(first).toBe(second)
  })

  it('refreshes cache when > 6 hours old', () => {
    const platform: Platform = 'youtube'
    const category = 'tech'
    const key = `${platform}:${category}`

    // Prime the cache
    const first = getTrends(platform, category)

    // Manually expire the cache entry
    const entry = trendCache.get(key)!
    trendCache.set(key, { ...entry, cachedAt: Date.now() - 7 * 60 * 60 * 1000 })

    // Next call should regenerate (new array reference)
    const second = getTrends(platform, category)
    expect(second).not.toBe(first)

    // But content should be the same (deterministic generation)
    expect(second).toEqual(first)
  })

  it('stores fresh cachedAt after cache miss', () => {
    const platform: Platform = 'facebook'
    const category = 'community'
    const key = `${platform}:${category}`
    const before = Date.now()

    getTrends(platform, category)

    const entry = trendCache.get(key)!
    expect(entry.cachedAt).toBeGreaterThanOrEqual(before)
    expect(entry.cachedAt).toBeLessThanOrEqual(Date.now())
  })
})
