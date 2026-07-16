// Image WebP conversion for the Compression Engine
// Requirements: 7.7

import { execFile } from 'child_process'
import { promisify } from 'util'
import { stat } from 'fs/promises'
import { extname, basename, dirname, join } from 'path'

const execFileAsync = promisify(execFile)

export interface WebPConversionResult {
  outputPath: string
  originalSizeBytes: number
  webpSizeBytes: number
  /** Ratio of webp size to original size (< 1.0 means smaller) */
  compressionRatio: number
  /** True if ≥25% reduction achieved (webpSize ≤ 75% of original) */
  meetsTarget: boolean
}

/** Target: WebP file size ≤ 75% of JPEG-equivalent (≥25% reduction) */
export const WEBP_SIZE_TARGET_RATIO = 0.75

/**
 * Convert an image to WebP format using FFmpeg.
 * Targets ≥25% file size reduction vs JPEG equivalent at equivalent perceptual quality.
 *
 * Requirements: 7.7
 */
export async function convertToWebP(
  sourcePath: string,
  quality = 80
): Promise<WebPConversionResult> {
  const dir = dirname(sourcePath)
  const ext = extname(sourcePath)
  const name = basename(sourcePath, ext)
  const outputPath = join(dir, `${name}.webp`)

  // Convert to WebP using FFmpeg's libwebp encoder
  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-c:v', 'libwebp',
    '-quality', String(quality),
    '-y',
    outputPath,
  ])

  const [originalStat, webpStat] = await Promise.all([
    stat(sourcePath),
    stat(outputPath),
  ])

  const originalSizeBytes = originalStat.size
  const webpSizeBytes = webpStat.size
  const compressionRatio = webpSizeBytes / originalSizeBytes

  return {
    outputPath,
    originalSizeBytes,
    webpSizeBytes,
    compressionRatio,
    meetsTarget: compressionRatio <= WEBP_SIZE_TARGET_RATIO,
  }
}

/**
 * Determine if a file is an image asset based on its format.
 */
export function isImageFormat(format: string): boolean {
  return ['jpeg', 'jpg', 'png', 'gif'].includes(format.toLowerCase())
}
