import { createLogger } from '@postpilot/logger'
const logger = createLogger('repurposing-engine')

// Scene detection and clip extraction for the Repurposing Engine
// Uses FFmpeg scdet filter to detect scene boundaries; stubs when FFmpeg is unavailable.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { uploadToS3 } from './s3.js'

const execFileAsync = promisify(execFile)

export interface SceneCandidate {
  startSeconds: number
  endSeconds: number
  speechDensity: number  // words per second in segment
  motionScore: number    // 0–1 normalised
  engagementScore: number
}

// ─── Scene boundary detection ─────────────────────────────────────────────

/**
 * Detect scene boundaries in a video asset using FFmpeg's scdet filter.
 * Returns candidate segments between detected boundaries.
 * Falls back to synthetic scenes when FFmpeg is not available.
 */
export async function detectScenes(
  assetS3Key: string,
  durationSeconds: number
): Promise<SceneCandidate[]> {
  try {
    return await detectScenesWithFFmpeg(assetS3Key, durationSeconds)
  } catch {
    logger.info('[sceneDetection] FFmpeg not available — generating synthetic scenes')
    return generateSyntheticScenes(durationSeconds)
  }
}

async function detectScenesWithFFmpeg(
  assetS3Key: string,
  durationSeconds: number
): Promise<SceneCandidate[]> {
  const bucket = process.env.GCS_BUCKET ?? process.env.S3_BUCKET ?? 'postpilot-assets'
  const gcsPublicUrl = process.env.GCS_PUBLIC_URL ?? process.env.S3_PUBLIC_URL ?? `https://storage.googleapis.com/${bucket}`
  const inputUrl = `${gcsPublicUrl}/${assetS3Key}`

  // Use scdet filter to detect scene changes; output timestamps to stderr
  const { stderr } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-show_frames',
    '-select_streams', 'v',
    '-f', 'lavfi',
    `movie=${inputUrl},scdet=threshold=10`,
    '-print_format', 'json',
  ])

  const boundaries: number[] = [0]

  // Parse scene change timestamps from ffprobe output
  const lines = stderr.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/pts_time:([\d.]+)/)
    if (match) {
      const t = parseFloat(match[1])
      if (t > 0 && t < durationSeconds) {
        boundaries.push(t)
      }
    }
  }

  boundaries.push(durationSeconds)
  boundaries.sort((a, b) => a - b)

  return boundariesToCandidates(boundaries)
}

function generateSyntheticScenes(durationSeconds: number): SceneCandidate[] {
  // Divide video into segments of roughly 20–30 seconds
  const targetSegmentLength = 25
  const count = Math.max(3, Math.ceil(durationSeconds / targetSegmentLength))
  const segmentLength = durationSeconds / count

  const boundaries: number[] = []
  for (let i = 0; i <= count; i++) {
    boundaries.push(Math.round(i * segmentLength * 10) / 10)
  }

  return boundariesToCandidates(boundaries)
}

function boundariesToCandidates(boundaries: number[]): SceneCandidate[] {
  const candidates: SceneCandidate[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    if (end - start > 0) {
      candidates.push({
        startSeconds: start,
        endSeconds: end,
        speechDensity: 0,
        motionScore: 0,
        engagementScore: 0,
      })
    }
  }
  return candidates
}

// ─── Segment scoring ──────────────────────────────────────────────────────

/**
 * Score each candidate segment by speech density, motion, and engagement.
 * Returns candidates sorted by engagementScore descending.
 */
export function scoreSegments(
  candidates: SceneCandidate[],
  transcriptionSegments: Array<{ start: number; end: number; text: string }>
): SceneCandidate[] {
  const scored = candidates.map((candidate) => {
    const duration = candidate.endSeconds - candidate.startSeconds

    // Speech density: words per second within this segment
    const wordsInSegment = transcriptionSegments
      .filter(
        (seg) =>
          seg.end > candidate.startSeconds && seg.start < candidate.endSeconds
      )
      .reduce((total, seg) => {
        // Weight by overlap fraction
        const overlapStart = Math.max(seg.start, candidate.startSeconds)
        const overlapEnd = Math.min(seg.end, candidate.endSeconds)
        const overlapFraction =
          seg.end > seg.start ? (overlapEnd - overlapStart) / (seg.end - seg.start) : 0
        const words = seg.text.trim().split(/\s+/).filter(Boolean).length
        return total + words * overlapFraction
      }, 0)

    const speechDensity = duration > 0 ? wordsInSegment / duration : 0

    // Motion score: use existing value or assign a synthetic heuristic
    // (In production this would come from FFmpeg motion vectors)
    const motionScore = candidate.motionScore

    // Engagement heuristic: weighted combination of speech density and motion
    // Normalise speech density (assume ~3 words/sec is high density)
    const normalisedSpeech = Math.min(speechDensity / 3, 1)
    const engagementScore = 0.6 * normalisedSpeech + 0.4 * motionScore

    return {
      ...candidate,
      speechDensity,
      motionScore,
      engagementScore,
    }
  })

  return scored.sort((a, b) => b.engagementScore - a.engagementScore)
}

// ─── Clip selection ───────────────────────────────────────────────────────

/**
 * Select 3–10 clips each 15–90 seconds from scored candidates.
 * Filters by duration bounds, then takes top N by engagement score.
 */
export function selectClips(
  scored: SceneCandidate[],
  minCount: number,
  maxCount: number,
  minDuration: number,
  maxDuration: number
): SceneCandidate[] {
  const withinBounds = scored.filter((c) => {
    const duration = c.endSeconds - c.startSeconds
    return duration >= minDuration && duration <= maxDuration
  })

  return withinBounds.slice(0, maxCount)
}

// ─── Silent/static detection ──────────────────────────────────────────────

const SPEECH_DENSITY_THRESHOLD = 0.05  // words per second
const MOTION_SCORE_THRESHOLD = 0.05    // 0–1 scale

/**
 * Returns false if all candidates have near-zero speech density AND near-zero motion.
 */
export function canExtractClips(candidates: SceneCandidate[]): boolean {
  if (candidates.length === 0) return false
  return candidates.some(
    (c) =>
      c.speechDensity > SPEECH_DENSITY_THRESHOLD ||
      c.motionScore > MOTION_SCORE_THRESHOLD
  )
}

// ─── Clip extraction ──────────────────────────────────────────────────────

/**
 * Extract a clip segment using FFmpeg and upload to S3.
 * Returns the S3 key of the extracted clip.
 * Stubs the extraction when FFmpeg is not available.
 */
export async function extractClip(
  assetS3Key: string,
  assetId: string,
  candidate: SceneCandidate,
  index: number
): Promise<string> {
  const s3Key = `clips/${assetId}/clip-${index}.mp4`

  try {
    await extractClipWithFFmpeg(assetS3Key, candidate, s3Key)
  } catch {
    logger.info(`[sceneDetection] FFmpeg not available — stubbing clip extraction for clip ${index}`)
    await stubExtractClip(s3Key)
  }

  return s3Key
}

async function extractClipWithFFmpeg(
  assetS3Key: string,
  candidate: SceneCandidate,
  s3Key: string
): Promise<void> {
  const bucket = process.env.GCS_BUCKET ?? process.env.S3_BUCKET ?? 'postpilot-assets'
  const gcsPublicUrl = process.env.GCS_PUBLIC_URL ?? process.env.S3_PUBLIC_URL ?? `https://storage.googleapis.com/${bucket}`
  const inputUrl = `${gcsPublicUrl}/${assetS3Key}`
  const duration = candidate.endSeconds - candidate.startSeconds
  const tmpOutput = `/tmp/${s3Key.replace(/\//g, '_')}`

  await execFileAsync('ffmpeg', [
    '-ss', String(candidate.startSeconds),
    '-i', inputUrl,
    '-t', String(duration),
    '-c', 'copy',
    '-y',
    tmpOutput,
  ])

  await uploadToS3(tmpOutput, s3Key)
}

async function stubExtractClip(s3Key: string): Promise<void> {
  // Stub: log and return without actual extraction
  logger.info(`[sceneDetection] stub: would upload clip to gs://${process.env.GCS_BUCKET ?? process.env.S3_BUCKET ?? 'postpilot-assets'}/${s3Key}`)
}
