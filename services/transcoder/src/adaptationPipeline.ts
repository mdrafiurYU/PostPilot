// FFmpeg-based platform adaptation pipeline
// Requirements: 1.4, 1.5

import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import { stat } from 'fs/promises'
import type { PlatformVariant } from './platformVariants.js'

const execFileAsync = promisify(execFile)

export interface AdaptationResult {
  outputPath: string
  fileSizeBytes: number
}

/**
 * Build the FFmpeg video filter for smart crop + scale to the target aspect ratio.
 *
 * Strategy:
 *  1. Crop the source to the target aspect ratio (center crop).
 *  2. Scale to the target resolution (never upscale beyond source).
 *
 * Requirements: 1.4
 */
function buildCropScaleFilter(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): string {
  const srcAR = srcWidth / srcHeight
  const tgtAR = targetWidth / targetHeight

  let cropW: number
  let cropH: number

  if (srcAR > tgtAR) {
    // Source is wider than target — crop sides
    cropH = srcHeight
    cropW = Math.round(srcHeight * tgtAR)
  } else {
    // Source is taller than target — crop top/bottom
    cropW = srcWidth
    cropH = Math.round(srcWidth / tgtAR)
  }

  // Ensure even dimensions for H.264/AV1 compatibility
  cropW = cropW % 2 === 0 ? cropW : cropW - 1
  cropH = cropH % 2 === 0 ? cropH : cropH - 1

  // Never upscale beyond source dimensions
  const scaleW = Math.min(targetWidth, cropW)
  const scaleH = Math.min(targetHeight, cropH)

  return `crop=${cropW}:${cropH}:(iw-${cropW})/2:(ih-${cropH})/2,scale=${scaleW}:${scaleH}`
}

/**
 * Build FFmpeg video codec args for the given codec.
 */
function buildVideoCodecArgs(codec: 'h264' | 'av1'): string[] {
  if (codec === 'av1') {
    return ['-c:v', 'libaom-av1', '-cpu-used', '4', '-b:v', '0', '-crf', '30']
  }
  // h264 default
  return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23']
}

/**
 * Probe source video dimensions using ffprobe.
 */
export async function probeVideoDimensions(
  sourcePath: string
): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    sourcePath,
  ])

  const probe = JSON.parse(stdout) as {
    streams: Array<{ codec_type: string; width?: number; height?: number }>
  }

  const videoStream = probe.streams.find((s) => s.codec_type === 'video')
  return {
    width: videoStream?.width ?? 1920,
    height: videoStream?.height ?? 1080,
  }
}

/**
 * Encode a single platform adaptation using FFmpeg.
 * Crops/resizes the source to the target aspect ratio and resolution,
 * converts to MP4 (H.264 or AV1), and preserves audio as AAC-LC.
 *
 * Requirements: 1.4, 1.5
 */
export async function encodeAdaptation(
  sourcePath: string,
  variant: PlatformVariant,
  srcWidth: number,
  srcHeight: number
): Promise<AdaptationResult> {
  const outputPath = join(
    tmpdir(),
    `adaptation_${variant.platform}_${variant.formatVariant}_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
  )

  const vf = buildCropScaleFilter(srcWidth, srcHeight, variant.width, variant.height)
  const videoArgs = buildVideoCodecArgs(variant.codec)

  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-vf', vf,
    ...videoArgs,
    // Preserve audio as AAC-LC stereo at 128 kbps
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    // MP4 container, fast-start for streaming
    '-f', 'mp4',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ])

  const fileStat = await stat(outputPath)
  return { outputPath, fileSizeBytes: fileStat.size }
}
