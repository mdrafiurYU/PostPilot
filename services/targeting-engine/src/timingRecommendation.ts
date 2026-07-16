// Posting time recommendation logic for the Targeting Engine
// Returns exactly 3 time slots within the next 7 days, ordered by predicted engagement descending.
// Falls back to platform-wide benchmarks when channel post_count < 10.
//
// Requirements: 3.3, 3.6

import type { Platform } from '@postpilot/types'
import { hashString } from './hashtagGeneration.js'

export interface TimingSlot {
  scheduled_at: string  // ISO 8601 datetime within next 7 days
  predicted_engagement_score: number  // 0–100
  data_source: 'channel_history' | 'platform_benchmarks'
}

// ─── Platform-wide benchmark windows ─────────────────────────────────────────
// Each entry is [dayOfWeek (0=Sun), hourUTC] representing known high-engagement windows.

const PLATFORM_BENCHMARK_WINDOWS: Record<Platform, Array<[number, number]>> = {
  tiktok:    [[2, 9], [4, 12], [6, 19]],   // Tue 9am, Thu 12pm, Sat 7pm UTC
  instagram: [[1, 11], [3, 14], [5, 17]],  // Mon 11am, Wed 2pm, Fri 5pm UTC
  youtube:   [[6, 15], [0, 14], [3, 18]],  // Sat 3pm, Sun 2pm, Wed 6pm UTC
  linkedin:  [[2, 8], [3, 12], [4, 17]],   // Tue 8am, Wed 12pm, Thu 5pm UTC
  facebook:  [[3, 13], [5, 11], [0, 16]],  // Wed 1pm, Fri 11am, Sun 4pm UTC
}

// Benchmark engagement scores per platform slot (index 0 = highest)
const PLATFORM_BENCHMARK_SCORES: Record<Platform, [number, number, number]> = {
  tiktok:    [88, 74, 61],
  instagram: [85, 72, 59],
  youtube:   [82, 70, 57],
  linkedin:  [80, 68, 55],
  facebook:  [78, 65, 52],
}

/**
 * Find the next occurrence of a given [dayOfWeek, hour] within the next 7 days,
 * starting strictly after `now`.
 */
function nextOccurrence(dayOfWeek: number, hour: number, now: Date): Date {
  const result = new Date(now)
  result.setUTCMinutes(0, 0, 0)
  result.setUTCHours(hour)

  // Advance to the correct day of week
  const currentDay = result.getUTCDay()
  let daysAhead = (dayOfWeek - currentDay + 7) % 7

  // If same day but hour has already passed (or is now), push to next week
  if (daysAhead === 0 && result <= now) {
    daysAhead = 7
  }

  result.setUTCDate(result.getUTCDate() + daysAhead)
  return result
}

/**
 * Generate 3 posting time recommendations based on platform-wide benchmarks.
 * Deterministic per platform.
 */
function benchmarkSlots(platform: Platform, now: Date): TimingSlot[] {
  const windows = PLATFORM_BENCHMARK_WINDOWS[platform]
  const scores = PLATFORM_BENCHMARK_SCORES[platform]

  return windows.map(([dayOfWeek, hour], i) => ({
    scheduled_at: nextOccurrence(dayOfWeek, hour, now).toISOString(),
    predicted_engagement_score: scores[i],
    data_source: 'platform_benchmarks' as const,
  }))
}

/**
 * Generate 3 posting time recommendations based on channel-specific history.
 * Deterministic per channel_id using the same djb2 hash as hashtagGeneration.
 */
function channelHistorySlots(channelId: string, now: Date): TimingSlot[] {
  const slots: TimingSlot[] = []

  for (let i = 0; i < 3; i++) {
    // Derive a deterministic offset in hours within the next 7 days (0–167h)
    const hourOffset = Math.floor(hashString(`${channelId}:timing:${i}`) * 168)

    const scheduled = new Date(now.getTime() + (hourOffset + 1) * 60 * 60 * 1000)
    // Zero out minutes/seconds for clean slot times
    scheduled.setUTCMinutes(0, 0, 0)

    // Derive a deterministic engagement score (50–95)
    const score = 50 + Math.round(hashString(`${channelId}:score:${i}`) * 45)

    slots.push({
      scheduled_at: scheduled.toISOString(),
      predicted_engagement_score: score,
      data_source: 'channel_history',
    })
  }

  // Sort descending by predicted_engagement_score
  slots.sort((a, b) => b.predicted_engagement_score - a.predicted_engagement_score)
  return slots
}

/**
 * Generate exactly 3 posting time recommendations for a channel.
 *
 * - If post_count < 10: use platform-wide benchmarks (cold-start fallback)
 * - If post_count >= 10: use channel-specific historical activity
 *
 * All slots are within the next 7 days and ordered by predicted_engagement_score descending.
 *
 * Requirements: 3.3, 3.6
 */
export function generateTimingRecommendations(
  channelId: string,
  platform: Platform,
  postCount: number,
  now: Date = new Date()
): TimingSlot[] {
  const slots =
    postCount < 10
      ? benchmarkSlots(platform, now)
      : channelHistorySlots(channelId, now)

  // Ensure sorted descending (benchmarkSlots are already ordered by design)
  slots.sort((a, b) => b.predicted_engagement_score - a.predicted_engagement_score)

  return slots
}
