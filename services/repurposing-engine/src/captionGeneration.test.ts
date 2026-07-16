import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Clip, Caption } from '@postpilot/types'
import {
  PLATFORM_CHAR_LIMITS,
  PLATFORMS,
  enforceCharLimit,
  buildCaptionWithHashtags,
  generateCaptionsForClip,
} from './captionGeneration.js'

// ─── Mock db.insertCaption ────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  insertCaption: vi.fn(async (caption: Caption) => caption),
  insertClip: vi.fn(),
  getClipsByAssetId: vi.fn(async () => []),
  updateClipSubtitlesKey: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-test-1',
    asset_id: 'asset-test-1',
    start_seconds: 0,
    end_seconds: 30,
    duration_seconds: 30,
    engagement_score: 0.8,
    s3_key: 'clips/asset-test-1/clip-0.mp4',
    captions: [],
    created_at: new Date(),
    ...overrides,
  }
}

// ─── PLATFORM_CHAR_LIMITS ─────────────────────────────────────────────────

describe('PLATFORM_CHAR_LIMITS', () => {
  it('has correct value for instagram (2200)', () => {
    expect(PLATFORM_CHAR_LIMITS.instagram).toBe(2200)
  })

  it('has correct value for tiktok (500)', () => {
    expect(PLATFORM_CHAR_LIMITS.tiktok).toBe(500)
  })

  it('has correct value for linkedin (5000)', () => {
    expect(PLATFORM_CHAR_LIMITS.linkedin).toBe(5000)
  })

  it('has correct value for youtube (5000)', () => {
    expect(PLATFORM_CHAR_LIMITS.youtube).toBe(5000)
  })

  it('has correct value for facebook (63206)', () => {
    expect(PLATFORM_CHAR_LIMITS.facebook).toBe(63206)
  })

  it('covers all 5 platforms', () => {
    expect(Object.keys(PLATFORM_CHAR_LIMITS)).toHaveLength(5)
    for (const platform of PLATFORMS) {
      expect(PLATFORM_CHAR_LIMITS[platform]).toBeGreaterThan(0)
    }
  })
})

// ─── enforceCharLimit ─────────────────────────────────────────────────────

describe('enforceCharLimit', () => {
  it('does not truncate text within the platform limit', () => {
    const text = 'Short caption text.'
    const result = enforceCharLimit(text, 'tiktok')
    expect(result).toBe(text)
    expect(result.length).toBeLessThanOrEqual(PLATFORM_CHAR_LIMITS.tiktok)
  })

  it('truncates text exceeding the platform limit', () => {
    // Build a string longer than tiktok's 500-char limit
    const longText = 'word '.repeat(120).trim() // ~599 chars
    const result = enforceCharLimit(longText, 'tiktok')
    expect(result.length).toBeLessThanOrEqual(PLATFORM_CHAR_LIMITS.tiktok)
  })

  it('appends "..." when truncation occurs', () => {
    const longText = 'word '.repeat(120).trim()
    const result = enforceCharLimit(longText, 'tiktok')
    expect(result.endsWith('...')).toBe(true)
  })

  it('truncates at a word boundary (no partial words)', () => {
    // Use words of different lengths so a mid-word cut would be detectable
    const longText = 'hello world testing boundary truncation '.repeat(15).trim()
    const result = enforceCharLimit(longText, 'tiktok')
    // The result must end with "..."
    expect(result.endsWith('...')).toBe(true)
    // The character just before "..." must be a complete word end (space was the separator)
    // i.e. the text before "..." should not end with a partial word character followed by nothing
    const beforeEllipsis = result.slice(0, -3)
    // Every word in the truncated text should be a complete word from the original
    const words = beforeEllipsis.trim().split(/\s+/)
    const originalWords = longText.split(/\s+/)
    for (const word of words) {
      expect(originalWords).toContain(word)
    }
  })

  it('does not truncate text exactly at the limit', () => {
    const text = 'a'.repeat(PLATFORM_CHAR_LIMITS.instagram)
    const result = enforceCharLimit(text, 'instagram')
    expect(result).toBe(text)
  })

  it('truncates text one character over the limit', () => {
    const text = 'a'.repeat(PLATFORM_CHAR_LIMITS.instagram + 1)
    const result = enforceCharLimit(text, 'instagram')
    expect(result.length).toBeLessThanOrEqual(PLATFORM_CHAR_LIMITS.instagram)
  })
})

// ─── buildCaptionWithHashtags ─────────────────────────────────────────────

describe('buildCaptionWithHashtags', () => {
  it('appends hashtags to the caption text', () => {
    const result = buildCaptionWithHashtags('Great video!', ['#fun', '#viral'], 'instagram')
    expect(result).toContain('Great video!')
    expect(result).toContain('#fun')
    expect(result).toContain('#viral')
  })

  it('prepends # to hashtags that are missing it', () => {
    const result = buildCaptionWithHashtags('Caption', ['fun', 'viral'], 'instagram')
    expect(result).toContain('#fun')
    expect(result).toContain('#viral')
  })

  it('does not duplicate # for hashtags that already have it', () => {
    const result = buildCaptionWithHashtags('Caption', ['#fun'], 'instagram')
    expect(result).not.toContain('##fun')
  })

  it('returns caption without hashtag section when hashtags array is empty', () => {
    const result = buildCaptionWithHashtags('Caption only', [], 'instagram')
    expect(result).toBe('Caption only')
  })

  it('enforces character limit when hashtags push the combined text over the limit', () => {
    // Build a caption that is close to the tiktok limit
    const caption = 'word '.repeat(90).trim() // ~449 chars
    const hashtags = ['#tag1', '#tag2', '#tag3', '#tag4', '#tag5', '#tag6', '#tag7', '#tag8']
    const result = buildCaptionWithHashtags(caption, hashtags, 'tiktok')
    expect(result.length).toBeLessThanOrEqual(PLATFORM_CHAR_LIMITS.tiktok)
  })
})

// ─── generateCaptionsForClip ──────────────────────────────────────────────

describe('generateCaptionsForClip', () => {
  beforeEach(() => {
    // Ensure no real API key is set so we use the stub path
    delete process.env.GROQ_API_KEY
  })

  it('returns one caption per platform (5 total)', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Test transcription text.')
    expect(captions).toHaveLength(5)
  })

  it('returns captions for all 5 platforms', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Test transcription text.')
    const platforms = captions.map((c) => c.platform).sort()
    expect(platforms).toEqual(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'])
  })

  it('each caption has the correct clip_id and asset_id', async () => {
    const clip = makeClip({ id: 'clip-abc', asset_id: 'asset-xyz' })
    const captions = await generateCaptionsForClip(clip, [], 'Transcription.')
    for (const caption of captions) {
      expect(caption.clip_id).toBe('clip-abc')
      expect(caption.asset_id).toBe('asset-xyz')
    }
  })

  it('each caption has a non-empty text', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Transcription.')
    for (const caption of captions) {
      expect(caption.text.length).toBeGreaterThan(0)
    }
  })

  it('each caption has character_count matching text length', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Transcription.')
    for (const caption of captions) {
      expect(caption.character_count).toBe(caption.text.length)
    }
  })

  it('each caption text respects the platform character limit', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Transcription.')
    for (const caption of captions) {
      expect(caption.text.length).toBeLessThanOrEqual(PLATFORM_CHAR_LIMITS[caption.platform])
    }
  })

  it('each caption has a unique id', async () => {
    const clip = makeClip()
    const captions = await generateCaptionsForClip(clip, [], 'Transcription.')
    const ids = captions.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(5)
  })

  it('calls db.insertCaption for each caption', async () => {
    const { insertCaption } = await import('./db.js')
    const mockInsert = vi.mocked(insertCaption)
    mockInsert.mockClear()

    const clip = makeClip()
    await generateCaptionsForClip(clip, [], 'Transcription.')
    expect(mockInsert).toHaveBeenCalledTimes(5)
  })
})
