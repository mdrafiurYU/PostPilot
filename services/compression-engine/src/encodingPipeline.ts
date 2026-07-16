// FFmpeg encoding pipeline with bitrate ladder generation
// Requirements: 7.3, 7.4

import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { stat } from 'fs/promises'
import type { Rendition } from '@postpilot/types'
import type { Codec } from './codecSelection.js'
import type { AudioChannelLayout, QualityTier } from './audioPreservation.js'
import { buildAudioArgs } from './audioPreservation.js'

const execFileAsync = promisify(execFile)

// ─── Rendition tier definitions ───────────────────────────────────────────────

export interface RenditionSpec {
  resolution: Rendition['resolution']
  height: number
  qualityTier: QualityTier
  /** Base bitrate in kbps — adjusted by content-aware analysis */
  baseBitrateKbps: number
}

export const RENDITION_SPECS: RenditionSpec[] = [
  { resolution: '360p',  height: 360,  qualityTier: 'low',      baseBitrateKbps: 800  },
  { resolution: '720p',  height: 720,  qualityTier: 'standard', baseBitrateKbps: 2500 },
  { resolution: '1080p', height: 1080, qualityTier: 'high',     baseBitrateKbps: 5000 },
]

// ─── Content-aware analysis ───────────────────────────────────────────────────

export interface ContentAnalysis {
  /** Average scene complexity score 0–1 (higher = more complex) */
  sceneComplexity: number
  /** Average motion level 0–1 */
  motionLevel: number
  /** Grain/noise level 0–1 */
  grainLevel: number
}

/**
 * Analyze source video using FFmpeg scene detection and motion estimation.
 * Returns normalized complexity, motion, and grain scores.
 *
 * Requirements: 7.4
 */
export async function analyzeContent(sourcePath: string): Promise<ContentAnalysis> {
  try {
    // Run scene detection to estimate complexity
    const { stderr } = await execFileAsync('ffmpeg', [
      '-i', sourcePath,
      '-vf', 'scdet=threshold=10,mestimate',
      '-f', 'null',
      '-',
    ])

    // Count scene changes as a proxy for complexity
    const sceneMatches = stderr.match(/lavfi\.scd\.score:\s*([\d.]+)/g) ?? []
    const sceneScores = sceneMatches.map((m) => parseFloat(m.split(':')[1] ?? '0'))
    const avgSceneScore = sceneScores.length > 0
      ? sceneScores.reduce((a, b) => a + b, 0) / sceneScores.length
      : 0.5

    // Normalize to 0–1 (scene scores are typically 0–100)
    const sceneComplexity = Math.min(avgSceneScore / 100, 1)

    // Estimate motion from scene change frequency
    const motionLevel = Math.min(sceneScores.length / 100, 1)

    // Estimate grain from high-frequency content (use sceneComplexity as proxy)
    const grainLevel = sceneComplexity * 0.5

    return { sceneComplexity, motionLevel, grainLevel }
  } catch {
    // Fall back to neutral values if analysis fails
    return { sceneComplexity: 0.5, motionLevel: 0.5, grainLevel: 0.3 }
  }
}

/**
 * Adjust bitrate based on content analysis.
 * Complex/high-motion scenes get higher bitrates; static scenes get lower.
 *
 * Requirements: 7.4
 */
export function adjustBitrateForContent(
  baseBitrateKbps: number,
  analysis: ContentAnalysis
): number {
  const complexityFactor = 0.5 + analysis.sceneComplexity * 0.5  // 0.5–1.0
  const motionFactor = 0.8 + analysis.motionLevel * 0.4           // 0.8–1.2
  const grainFactor = 1.0 + analysis.grainLevel * 0.2             // 1.0–1.2

  const adjusted = baseBitrateKbps * complexityFactor * motionFactor * grainFactor
  return Math.round(adjusted)
}

// ─── Source video probing ─────────────────────────────────────────────────────

export interface VideoProbe {
  width: number
  height: number
  durationSeconds: number
  audioChannelLayout: AudioChannelLayout
}

/**
 * Probe source video metadata using ffprobe.
 */
export async function probeVideo(sourcePath: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    sourcePath,
  ])

  const probe = JSON.parse(stdout) as {
    streams: Array<{
      codec_type: string
      width?: number
      height?: number
      duration?: string
      channels?: number
      channel_layout?: string
    }>
  }

  const videoStream = probe.streams.find((s) => s.codec_type === 'video')
  const audioStream = probe.streams.find((s) => s.codec_type === 'audio')

  const width = videoStream?.width ?? 1920
  const height = videoStream?.height ?? 1080
  const durationSeconds = parseFloat(videoStream?.duration ?? '0')

  const channels = audioStream?.channels ?? 2
  const audioChannelLayout = channelsToLayout(channels)

  return { width, height, durationSeconds, audioChannelLayout }
}

function channelsToLayout(channels: number): AudioChannelLayout {
  if (channels === 1) return 'mono'
  if (channels === 6) return '5.1'
  return 'stereo'
}

// ─── Codec-specific FFmpeg args ───────────────────────────────────────────────

function buildVideoArgs(codec: Codec, bitrateKbps: number): string[] {
  switch (codec) {
    case 'h264':
      return ['-c:v', 'libx264', '-preset', 'slow', '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps * 2}k`, '-bufsize', `${bitrateKbps * 4}k`]
    case 'h265':
      return ['-c:v', 'libx265', '-preset', 'slow', '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps * 2}k`, '-bufsize', `${bitrateKbps * 4}k`]
    case 'av1':
      return ['-c:v', 'libaom-av1', '-cpu-used', '4', '-b:v', `${bitrateKbps}k`]
  }
}

// ─── Single rendition encoding ────────────────────────────────────────────────

export interface EncodedRendition {
  outputPath: string
  width: number
  height: number
  bitrateKbps: number
  fileSizeBytes: number
  resolution: Rendition['resolution']
  qualityTier: QualityTier
}

/**
 * Encode a single rendition at the specified height and bitrate.
 */
export async function encodeRendition(
  sourcePath: string,
  spec: RenditionSpec,
  codec: Codec,
  bitrateKbps: number,
  audioChannelLayout: AudioChannelLayout,
  sourceWidth: number,
  sourceHeight: number
): Promise<EncodedRendition> {
  // Clamp height to source resolution
  const targetHeight = Math.min(spec.height, sourceHeight)
  // Maintain aspect ratio; ensure even dimensions
  const aspectRatio = sourceWidth / sourceHeight
  const targetWidth = Math.round((targetHeight * aspectRatio) / 2) * 2
  const actualHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1

  const outputPath = join(
    tmpdir(),
    `rendition_${spec.resolution}_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
  )

  const videoArgs = buildVideoArgs(codec, bitrateKbps)
  const audioArgs = buildAudioArgs(audioChannelLayout, spec.qualityTier)

  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-vf', `scale=${targetWidth}:${actualHeight}`,
    ...videoArgs,
    ...audioArgs,
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ])

  const fileStat = await stat(outputPath)

  return {
    outputPath,
    width: targetWidth,
    height: actualHeight,
    bitrateKbps,
    fileSizeBytes: fileStat.size,
    resolution: spec.resolution,
    qualityTier: spec.qualityTier,
  }
}
