import { describe, it, expect } from 'vitest'
import {
  selectClips,
  scoreSegments,
  canExtractClips,
  type SceneCandidate,
} from './sceneDetection.js'

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeCandidate(
  startSeconds: number,
  endSeconds: number,
  speechDensity = 0,
  motionScore = 0
): SceneCandidate {
  return {
    startSeconds,
    endSeconds,
    speechDensity,
    motionScore,
    engagementScore: 0,
  }
}

// ─── selectClips ──────────────────────────────────────────────────────────

describe('selectClips', () => {
  it('filters out clips shorter than minDuration (15s)', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 10),    // 10s — too short
      makeCandidate(10, 30),   // 20s — ok
      makeCandidate(30, 60),   // 30s — ok
      makeCandidate(60, 90),   // 30s — ok
    ]
    const result = selectClips(candidates, 3, 10, 15, 90)
    expect(result.every((c) => c.endSeconds - c.startSeconds >= 15)).toBe(true)
    expect(result.some((c) => c.startSeconds === 0 && c.endSeconds === 10)).toBe(false)
  })

  it('filters out clips longer than maxDuration (90s)', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 100),   // 100s — too long
      makeCandidate(100, 130), // 30s — ok
      makeCandidate(130, 160), // 30s — ok
      makeCandidate(160, 190), // 30s — ok
    ]
    const result = selectClips(candidates, 3, 10, 15, 90)
    expect(result.every((c) => c.endSeconds - c.startSeconds <= 90)).toBe(true)
    expect(result.some((c) => c.startSeconds === 0 && c.endSeconds === 100)).toBe(false)
  })

  it('returns at most maxCount (10) clips', () => {
    const candidates: SceneCandidate[] = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(i * 20, i * 20 + 20)
    )
    const result = selectClips(candidates, 3, 10, 15, 90)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('returns only clips within [15, 90] second range', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 5),     // 5s — too short
      makeCandidate(5, 20),    // 15s — exactly at min
      makeCandidate(20, 110),  // 90s — exactly at max
      makeCandidate(110, 210), // 100s — too long
    ]
    const result = selectClips(candidates, 3, 10, 15, 90)
    for (const clip of result) {
      const duration = clip.endSeconds - clip.startSeconds
      expect(duration).toBeGreaterThanOrEqual(15)
      expect(duration).toBeLessThanOrEqual(90)
    }
  })

  it('returns between 0 and maxCount clips from a valid set', () => {
    const candidates: SceneCandidate[] = Array.from({ length: 15 }, (_, i) =>
      makeCandidate(i * 30, i * 30 + 30)
    )
    const result = selectClips(candidates, 3, 10, 15, 90)
    expect(result.length).toBeGreaterThanOrEqual(0)
    expect(result.length).toBeLessThanOrEqual(10)
  })
})

// ─── scoreSegments ────────────────────────────────────────────────────────

describe('scoreSegments', () => {
  it('assigns higher engagementScore to segments with more speech', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30),   // will have speech
      makeCandidate(30, 60),  // will be silent
    ]

    const transcriptionSegments = [
      { start: 0, end: 5, text: 'Hello world this is a test with many words here' },
      { start: 5, end: 10, text: 'More words to increase speech density significantly' },
      { start: 10, end: 15, text: 'Even more speech content in this segment for density' },
    ]

    const scored = scoreSegments(candidates, transcriptionSegments)

    // The segment with speech (0–30) should have higher engagement than the silent one (30–60)
    const speechSegment = scored.find((c) => c.startSeconds === 0)!
    const silentSegment = scored.find((c) => c.startSeconds === 30)!

    expect(speechSegment.speechDensity).toBeGreaterThan(silentSegment.speechDensity)
    expect(speechSegment.engagementScore).toBeGreaterThan(silentSegment.engagementScore)
  })

  it('returns candidates sorted by engagementScore descending', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30),
      makeCandidate(30, 60),
      makeCandidate(60, 90),
    ]

    const transcriptionSegments = [
      { start: 60, end: 90, text: 'Lots of speech in the third segment here' },
    ]

    const scored = scoreSegments(candidates, transcriptionSegments)

    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].engagementScore).toBeGreaterThanOrEqual(scored[i + 1].engagementScore)
    }
  })

  it('assigns zero speechDensity to segments with no overlapping transcription', () => {
    const candidates: SceneCandidate[] = [makeCandidate(100, 130)]
    const transcriptionSegments = [{ start: 0, end: 50, text: 'words here' }]

    const scored = scoreSegments(candidates, transcriptionSegments)
    expect(scored[0].speechDensity).toBe(0)
  })
})

// ─── canExtractClips ──────────────────────────────────────────────────────

describe('canExtractClips', () => {
  it('returns false when all candidates are silent and static', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30, 0, 0),
      makeCandidate(30, 60, 0.01, 0.01),  // below threshold
      makeCandidate(60, 90, 0, 0),
    ]
    expect(canExtractClips(candidates)).toBe(false)
  })

  it('returns true when at least one candidate has speech', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30, 0, 0),
      makeCandidate(30, 60, 1.5, 0),  // has speech
    ]
    expect(canExtractClips(candidates)).toBe(true)
  })

  it('returns true when at least one candidate has motion', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30, 0, 0),
      makeCandidate(30, 60, 0, 0.8),  // has motion
    ]
    expect(canExtractClips(candidates)).toBe(true)
  })

  it('returns false for an empty candidates array', () => {
    expect(canExtractClips([])).toBe(false)
  })

  it('returns true when a candidate has both speech and motion', () => {
    const candidates: SceneCandidate[] = [
      makeCandidate(0, 30, 2.0, 0.7),
    ]
    expect(canExtractClips(candidates)).toBe(true)
  })
})
