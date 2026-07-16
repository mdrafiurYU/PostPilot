import { createLogger } from '@postpilot/logger'
const logger = createLogger('targeting-engine')

// Trend analysis logic for the Targeting Engine
// Returns exactly 10 trending topics or audio tracks per platform per content category.
// Cache is refreshed at least every 6 hours via a background job.
//
// Requirements: 3.4

import type { Platform } from '@postpilot/types'
import { hashString } from './hashtagGeneration.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendEntry {
  topic: string
  category: string
  platform: Platform
  trend_score: number  // 0–100 normalized
  type: 'topic' | 'audio_track'
}

interface CacheEntry {
  trends: TrendEntry[]
  cachedAt: number  // Date.now() timestamp
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 6 * 60 * 60 * 1000  // 6 hours
const TREND_COUNT = 10

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

// Topic pools per platform
const PLATFORM_TOPICS: Record<Platform, string[]> = {
  tiktok: [
    'BookTok', 'CleanTok', 'FoodTok', 'FitTok', 'CottageCore', 'DarkAcademia',
    'StudyWithMe', 'GRWM', 'POV', 'StitchChallenge', 'DuetChallenge', 'TikTokMadeMeBuyIt',
    'SoundHealing', 'ThriftFlip', 'RoomTour', 'NightRoutine', 'MorningRoutine', 'LifeHacks',
    'CookWithMe', 'WorkoutCheck', 'SkillShare', 'MiniVlog', 'TransitionTrend', 'AestheticEdit',
  ],
  instagram: [
    'ReelsViral', 'CarouselPost', 'BeforeAndAfter', 'OutfitInspo', 'MealPrep', 'HomeDecor',
    'TravelDiaries', 'FlatLay', 'GoldenHour', 'MoodBoard', 'BodyPositivity', 'SkincareTips',
    'FitnessJourney', 'BehindTheScenes', 'DayInMyLife', 'ProductReview', 'Collab', 'Giveaway',
    'QuoteOfTheDay', 'MindfulLiving', 'PlantParent', 'CoffeeAesthetic', 'SunsetVibes', 'Wanderlust',
  ],
  youtube: [
    'LongFormContent', 'MiniDocumentary', 'ReactVideo', 'TierList', 'RoomTour', 'UnboxingVideo',
    'ChallengeVideo', 'QandA', 'Storytime', 'StudyWithMe', 'CookingTutorial', 'TechReview',
    'GameplayHighlights', 'VlogSeries', 'SkillTutorial', 'DebateVideo', 'CollabSeries',
    'AnnualReview', 'BudgetBreakdown', 'CareerAdvice', 'LanguageLearning', 'BookReview',
    'FilmAnalysis', 'MusicCover',
  ],
  linkedin: [
    'CareerGrowth', 'LeadershipTips', 'StartupStory', 'RemoteWork', 'AIinBusiness',
    'PersonalBranding', 'NetworkingAdvice', 'ProductivityHacks', 'WorkLifeBalance',
    'HiringTrends', 'TechInnovation', 'SustainableBusiness', 'DEIInitiatives',
    'MentalHealthAtWork', 'FreelanceLife', 'SideHustle', 'InvestmentTips', 'SalesStrategy',
    'MarketingTrends', 'DataDrivenDecisions', 'FutureOfWork', 'SkillsGap', 'Mentorship',
    'FounderStory',
  ],
  facebook: [
    'CommunitySpotlight', 'LocalBusiness', 'FamilyMoments', 'RecipeShare', 'DIYProject',
    'GardeningTips', 'PetPhotos', 'ThrowbackThursday', 'MotivationMonday', 'WisdomWednesday',
    'FridayFeeling', 'WeekendVibes', 'GroupChallenge', 'LiveEvent', 'Giveaway',
    'ProductLaunch', 'CustomerStory', 'BehindTheScenes', 'HolidayContent', 'SeasonalTrend',
    'NewsReaction', 'CauseAwareness', 'FunFact', 'PollQuestion',
  ],
}

// Audio track pools per platform
const PLATFORM_AUDIO_TRACKS: Record<Platform, string[]> = {
  tiktok: [
    'Espresso - Sabrina Carpenter', 'Flowers - Miley Cyrus', 'As It Was - Harry Styles',
    'Unholy - Sam Smith', 'Creepin - Metro Boomin', 'Calm Down - Rema', 'Shakira Shakira',
    'Levitating - Dua Lipa', 'Blinding Lights - The Weeknd', 'Stay - Kid Laroi',
    'Heat Waves - Glass Animals', 'Watermelon Sugar - Harry Styles', 'Peaches - Justin Bieber',
    'Good 4 U - Olivia Rodrigo', 'Montero - Lil Nas X',
  ],
  instagram: [
    'Golden Hour - JVKE', 'Sunroof - Nicky Youre', 'Beggin - Maneskin', 'Infinity - Jaymes Young',
    'Dandelions - Ruth B', 'Falling - Trevor Daniel', 'Arcade - Duncan Laurence',
    'Lovely - Billie Eilish', 'Drivers License - Olivia Rodrigo', 'Positions - Ariana Grande',
    'Mood - 24kGoldn', 'Dynamite - BTS', 'Butter - BTS', 'Permission to Dance - BTS',
    'Save Your Tears - The Weeknd',
  ],
  youtube: [
    'Intro Vibes Lo-Fi', 'Epic Cinematic Build', 'Chill Study Beats', 'Upbeat Corporate',
    'Dramatic Reveal Sting', 'Retro Synthwave', 'Acoustic Warmth', 'Tension Builder',
    'Happy Ukulele', 'Motivational Hip-Hop', 'Ambient Drone', 'Comedy Boing',
    'News Ticker Bed', 'Gaming Action Loop', 'Emotional Piano',
  ],
  linkedin: [
    'Professional Ambient', 'Corporate Inspire', 'Subtle Jazz Background', 'Motivational Strings',
    'Clean Tech Pulse', 'Leadership Theme', 'Innovation Soundscape', 'Success Fanfare',
    'Calm Focus', 'Executive Presence', 'Growth Mindset Beat', 'Networking Groove',
    'Startup Energy', 'Boardroom Ambience', 'Future Forward',
  ],
  facebook: [
    'Feel Good Pop', 'Nostalgic Acoustic', 'Community Anthem', 'Uplifting Gospel',
    'Family Moments Waltz', 'Celebration Brass', 'Hometown Pride', 'Seasonal Joy',
    'Heartwarming Strings', 'Friendly Ukulele', 'Local Hero Theme', 'Weekend Vibes',
    'Backyard BBQ', 'Holiday Cheer', 'Reunion Melody',
  ],
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const trendCache = new Map<string, CacheEntry>()

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Deterministically generate exactly 10 TrendEntry items for a platform+category.
 * Uses the same djb2 hash approach from hashtagGeneration.ts.
 */
export function generateTrends(platform: Platform, category: string): TrendEntry[] {
  const seed = hashString(`${platform}:${category}`)
  const topics = PLATFORM_TOPICS[platform]
  const audioTracks = PLATFORM_AUDIO_TRACKS[platform]

  // Deterministically shuffle topics
  const shuffledTopics = [...topics]
  for (let i = shuffledTopics.length - 1; i > 0; i--) {
    const jSeed = hashString(`${platform}:${category}:topic:${i}`)
    const j = Math.floor(jSeed * (i + 1))
    ;[shuffledTopics[i], shuffledTopics[j]] = [shuffledTopics[j], shuffledTopics[i]]
  }

  // Deterministically shuffle audio tracks
  const shuffledAudio = [...audioTracks]
  for (let i = shuffledAudio.length - 1; i > 0; i--) {
    const jSeed = hashString(`${platform}:${category}:audio:${i}`)
    const j = Math.floor(jSeed * (i + 1))
    ;[shuffledAudio[i], shuffledAudio[j]] = [shuffledAudio[j], shuffledAudio[i]]
  }

  // Decide split: how many topics vs audio tracks (5 each, or skewed by seed)
  const topicCount = 5 + Math.floor(seed * 3)  // 5–7 topics
  const audioCount = TREND_COUNT - topicCount   // 3–5 audio tracks

  const entries: TrendEntry[] = []

  for (let i = 0; i < topicCount; i++) {
    const topic = shuffledTopics[i % shuffledTopics.length]
    const scoreSeed = hashString(`${platform}:${category}:tscore:${i}`)
    const trend_score = Math.round(50 + scoreSeed * 50)  // 50–100
    entries.push({ topic, category, platform, trend_score, type: 'topic' })
  }

  for (let i = 0; i < audioCount; i++) {
    const topic = shuffledAudio[i % shuffledAudio.length]
    const scoreSeed = hashString(`${platform}:${category}:ascore:${i}`)
    const trend_score = Math.round(40 + scoreSeed * 60)  // 40–100
    entries.push({ topic, category, platform, trend_score, type: 'audio_track' })
  }

  // Sort by trend_score descending
  entries.sort((a, b) => b.trend_score - a.trend_score)

  return entries
}

/**
 * Get trends for a platform+category, using cache if < 6 hours old.
 * Otherwise regenerates and updates the cache.
 */
export function getTrends(platform: Platform, category: string): TrendEntry[] {
  const key = `${platform}:${category}`
  const now = Date.now()
  const cached = trendCache.get(key)

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.trends
  }

  const trends = generateTrends(platform, category)
  trendCache.set(key, { trends, cachedAt: now })
  return trends
}

/**
 * Expose the cache for testing purposes (allows manipulating cachedAt).
 */
export { trendCache }

// ─── Background refresh job ───────────────────────────────────────────────────

/**
 * Refresh the trend cache for all known platform+category combinations.
 * Called by the background interval every 6 hours.
 */
function refreshAllCachedTrends(): void {
  let refreshed = 0
  for (const [key] of trendCache) {
    const [platform, ...categoryParts] = key.split(':')
    const category = categoryParts.join(':')
    const trends = generateTrends(platform as Platform, category)
    trendCache.set(key, { trends, cachedAt: Date.now() })
    refreshed++
  }
  if (refreshed > 0) {
    logger.info(`[targeting-engine] trend cache refreshed for ${refreshed} platform+category combinations`)
  }
}

// Start background job — refreshes every 6 hours
setInterval(refreshAllCachedTrends, CACHE_TTL_MS)
