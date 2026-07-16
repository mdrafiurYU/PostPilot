// Hashtag generation logic for the Targeting Engine
// Uses a deterministic algorithm based on post content and platform.
// No external API calls — realistic stub suitable for development and testing.

import type { HashtagSuggestion, Platform } from '@postpilot/types'

// ─── Platform-specific hashtag pools ─────────────────────────────────────────

const PLATFORM_HASHTAGS: Record<Platform, string[]> = {
  tiktok: [
    'fyp', 'foryou', 'foryoupage', 'viral', 'trending', 'tiktok', 'tiktokviral',
    'explore', 'reels', 'content', 'creator', 'video', 'funny', 'entertainment',
    'lifestyle', 'fashion', 'beauty', 'food', 'travel', 'fitness', 'motivation',
    'dance', 'music', 'comedy', 'art', 'diy', 'howto', 'tutorial', 'tips',
    'hack', 'satisfying', 'aesthetic', 'vlog', 'dayinmylife', 'storytime',
  ],
  instagram: [
    'instagood', 'photooftheday', 'love', 'beautiful', 'happy', 'follow',
    'picoftheday', 'like4like', 'followme', 'instalike', 'repost', 'summer',
    'art', 'instadaily', 'friends', 'nature', 'fun', 'style', 'smile', 'food',
    'travel', 'fitness', 'motivation', 'fashion', 'photography', 'beauty',
    'lifestyle', 'music', 'ootd', 'selfie', 'sunset', 'explore', 'reels',
    'instareels', 'contentcreator',
  ],
  youtube: [
    'youtube', 'youtuber', 'subscribe', 'video', 'vlog', 'tutorial', 'howto',
    'review', 'gaming', 'music', 'comedy', 'entertainment', 'education',
    'technology', 'science', 'cooking', 'travel', 'fitness', 'motivation',
    'documentary', 'shorts', 'youtubeshorts', 'newvideo', 'trending',
    'viral', 'creator', 'content', 'channel', 'like', 'comment',
    'watchtime', 'algorithm', 'recommended', 'featured',
  ],
  linkedin: [
    'linkedin', 'networking', 'career', 'jobs', 'hiring', 'recruitment',
    'leadership', 'management', 'business', 'entrepreneur', 'startup',
    'innovation', 'technology', 'ai', 'machinelearning', 'datascience',
    'marketing', 'sales', 'productivity', 'success', 'motivation',
    'personaldevelopment', 'learning', 'education', 'skills', 'growth',
    'strategy', 'finance', 'investment', 'remote', 'workfromhome',
    'futureofwork', 'diversity', 'inclusion', 'sustainability',
  ],
  facebook: [
    'facebook', 'facebookreels', 'viral', 'trending', 'share', 'like',
    'community', 'family', 'friends', 'love', 'fun', 'entertainment',
    'news', 'local', 'business', 'smallbusiness', 'shop', 'sale',
    'event', 'giveaway', 'contest', 'challenge', 'throwback', 'memories',
    'inspiration', 'motivation', 'quotes', 'humor', 'memes', 'diy',
    'recipe', 'cooking', 'travel', 'fitness', 'health',
  ],
}

// ─── Volume tier thresholds ───────────────────────────────────────────────────

// Simulated post counts per hashtag (deterministic based on hashtag string hash)
const HIGH_VOLUME_THRESHOLD = 1_000_000   // >1M posts → 'high'
const MID_VOLUME_THRESHOLD = 100_000      // 100K–1M posts → 'mid'
// <100K posts → 'niche'

/**
 * Deterministic hash of a string → number in [0, 1)
 * Uses a simple djb2-style hash for reproducibility.
 */
export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
    h = h >>> 0 // keep as unsigned 32-bit
  }
  return h / 0xffffffff
}

/**
 * Simulate the post count for a hashtag on a given platform.
 * Returns a deterministic value based on the hashtag + platform.
 */
export function simulatePostCount(hashtag: string, platform: Platform): number {
  const seed = hashString(`${hashtag}:${platform}`)
  // Distribute: ~20% high, ~40% mid, ~40% niche
  if (seed < 0.2) {
    // high volume: 1M–50M
    return Math.floor(1_000_000 + seed * 5 * 49_000_000)
  } else if (seed < 0.6) {
    // mid volume: 100K–1M
    return Math.floor(100_000 + (seed - 0.2) * 2.5 * 900_000)
  } else {
    // niche: 1K–100K
    return Math.floor(1_000 + (seed - 0.6) * 2.5 * 99_000)
  }
}

/**
 * Classify a hashtag by its simulated post count.
 */
export function classifyVolumeTier(postCount: number): 'high' | 'mid' | 'niche' {
  if (postCount > HIGH_VOLUME_THRESHOLD) return 'high'
  if (postCount >= MID_VOLUME_THRESHOLD) return 'mid'
  return 'niche'
}

/**
 * Compute a predicted reach score (0–100) for a hashtag on a platform.
 * Balances volume (reach potential) with niche relevance (less competition).
 * Deterministic based on hashtag + platform.
 */
export function computeReachScore(hashtag: string, platform: Platform): number {
  const postCount = simulatePostCount(hashtag, platform)
  const tier = classifyVolumeTier(postCount)

  // Base score from volume tier
  let base: number
  if (tier === 'high') {
    base = 60 + hashString(`reach:${hashtag}:${platform}`) * 40  // 60–100
  } else if (tier === 'mid') {
    base = 30 + hashString(`reach:${hashtag}:${platform}`) * 40  // 30–70
  } else {
    base = 5 + hashString(`reach:${hashtag}:${platform}`) * 35   // 5–40
  }

  return Math.round(base * 10) / 10  // round to 1 decimal
}

/**
 * Generate hashtag suggestions for a given post and platform.
 *
 * The algorithm:
 * 1. Start with the platform's hashtag pool
 * 2. Use a deterministic seed (postId + platform) to select and order hashtags
 * 3. Aim for a mix of high/mid/niche tiers
 * 4. Return 5–30 hashtags ranked by predicted_reach_score descending
 *
 * Requirements: 3.1, 3.2
 */
export function generateHashtagSuggestions(
  postId: string,
  platform: Platform
): HashtagSuggestion[] {
  const pool = PLATFORM_HASHTAGS[platform]
  const seed = hashString(`${postId}:${platform}`)

  // Deterministically shuffle the pool using the seed
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const jSeed = hashString(`${postId}:${platform}:${i}`)
    const j = Math.floor(jSeed * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Select between 5 and 30 hashtags deterministically
  const MIN_HASHTAGS = 5
  const MAX_HASHTAGS = 30
  const count = MIN_HASHTAGS + Math.floor(seed * (MAX_HASHTAGS - MIN_HASHTAGS + 1))
  const selected = shuffled.slice(0, Math.min(count, shuffled.length))

  // Ensure we always have at least 5
  if (selected.length < MIN_HASHTAGS) {
    // Pad with remaining pool items if needed
    const remaining = shuffled.slice(selected.length)
    selected.push(...remaining.slice(0, MIN_HASHTAGS - selected.length))
  }

  // Build suggestion objects with scores
  const suggestions: HashtagSuggestion[] = selected.map((hashtag) => {
    const postCount = simulatePostCount(hashtag, platform)
    const volume_tier = classifyVolumeTier(postCount)
    const predicted_reach_score = computeReachScore(hashtag, platform)
    return { hashtag, platform, volume_tier, predicted_reach_score, rank: 0 }
  })

  // Sort by predicted_reach_score descending (Req 3.1)
  suggestions.sort((a, b) => b.predicted_reach_score - a.predicted_reach_score)

  // Assign ranks (1-based)
  suggestions.forEach((s, i) => {
    s.rank = i + 1
  })

  return suggestions
}
