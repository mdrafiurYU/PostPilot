// Unit tests for timing recommendation logic
// Requirements: 3.3, 3.6

import { describe, it, expect } from 'vitest'
import { generateTimingRecommendations, type TimingSlot } from './timingRecommendation.js'

const NOW = new Date('2024-06-10T12:00:00.000Z')
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

describe('generateTimingRecommendations', () => {
  it('returns exactly 3 slots', () => {
    const slots = generateTimingRecommendations('channel-1', 'tiktok', 15, NOW)
    expect(slots).toHaveLength(3)
  })

  it('all slots fall within the next 7 days', () => {
    const slots = generateTimingRecommendations('channel-abc', 'instagram', 20, NOW)
    const nowMs = NOW.getTime()
    const maxMs = nowMs + SEVEN_DAYS_MS

    for (const slot of slots) {
      const slotMs = new Date(slot.scheduled_at).getTime()
      expect(slotMs).toBeGreaterThan(nowMs)
      expect(slotMs).toBeLessThanOrEqual(maxMs)
    }
  })

  it('slots are ordered by predicted_engagement_score descending', () => {
    const slots = generateTimingRecommendations('channel-xyz', 'youtube', 50, NOW)
    for (let i = 0; i < slots.length - 1; i++) {
      expect(slots[i].predicted_engagement_score).toBeGreaterThanOrEqual(
        slots[i + 1].predicted_engagement_score
      )
    }
  })

  it('cold-start (post_count < 10) uses data_source: platform_benchmarks', () => {
    const slots = generateTimingRecommendations('new-channel', 'linkedin', 5, NOW)
    for (const slot of slots) {
      expect(slot.data_source).toBe('platform_benchmarks')
    }
  })

  it('post_count = 0 uses data_source: platform_benchmarks', () => {
    const slots = generateTimingRecommendations('brand-new', 'facebook', 0, NOW)
    for (const slot of slots) {
      expect(slot.data_source).toBe('platform_benchmarks')
    }
  })

  it('post_count = 9 (boundary) uses data_source: platform_benchmarks', () => {
    const slots = generateTimingRecommendations('almost-there', 'tiktok', 9, NOW)
    for (const slot of slots) {
      expect(slot.data_source).toBe('platform_benchmarks')
    }
  })

  it('non-cold-start (post_count >= 10) uses data_source: channel_history', () => {
    const slots = generateTimingRecommendations('established-channel', 'instagram', 10, NOW)
    for (const slot of slots) {
      expect(slot.data_source).toBe('channel_history')
    }
  })

  it('post_count = 100 uses data_source: channel_history', () => {
    const slots = generateTimingRecommendations('popular-channel', 'youtube', 100, NOW)
    for (const slot of slots) {
      expect(slot.data_source).toBe('channel_history')
    }
  })

  it('scheduled_at values are valid ISO 8601 strings', () => {
    const slots = generateTimingRecommendations('channel-1', 'tiktok', 20, NOW)
    for (const slot of slots) {
      expect(() => new Date(slot.scheduled_at)).not.toThrow()
      expect(new Date(slot.scheduled_at).toISOString()).toBe(slot.scheduled_at)
    }
  })

  it('predicted_engagement_score is between 0 and 100', () => {
    const slots = generateTimingRecommendations('channel-1', 'linkedin', 25, NOW)
    for (const slot of slots) {
      expect(slot.predicted_engagement_score).toBeGreaterThanOrEqual(0)
      expect(slot.predicted_engagement_score).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic — same inputs produce same outputs', () => {
    const a = generateTimingRecommendations('channel-det', 'facebook', 30, NOW)
    const b = generateTimingRecommendations('channel-det', 'facebook', 30, NOW)
    expect(a).toEqual(b)
  })

  it('different channel IDs produce different channel_history slots', () => {
    const a = generateTimingRecommendations('channel-aaa', 'tiktok', 20, NOW)
    const b = generateTimingRecommendations('channel-bbb', 'tiktok', 20, NOW)
    // At least one slot should differ
    const aTimes = a.map((s) => s.scheduled_at)
    const bTimes = b.map((s) => s.scheduled_at)
    expect(aTimes).not.toEqual(bTimes)
  })

  it('benchmark slots are the same for same platform regardless of channel_id', () => {
    const a = generateTimingRecommendations('channel-111', 'instagram', 0, NOW)
    const b = generateTimingRecommendations('channel-222', 'instagram', 0, NOW)
    expect(a).toEqual(b)
  })
})
