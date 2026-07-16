import { createLogger } from '@postpilot/logger'
const logger = createLogger('compression-engine')

// VMAF scoring and quality gate for the Compression Engine
// Requirements: 7.5, 7.6, 7.10

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { QualityTier } from './audioPreservation.js'

const execFileAsync = promisify(execFile)

/** Minimum VMAF score required per quality tier */
export const VMAF_THRESHOLDS: Record<QualityTier, number> = {
  low: 85,
  standard: 85,
  high: 93,
}

export interface VmafResult {
  score: number
  meetsThreshold: boolean
  threshold: number
  qualityTier: QualityTier
}

/**
 * Compute VMAF score by running FFmpeg's libvmaf filter.
 * Compares the encoded rendition against the source reference.
 *
 * @param sourcePath  Path to the original source video
 * @param encodedPath Path to the encoded rendition
 * @param qualityTier Quality tier to determine the threshold
 */
export async function computeVmaf(
  sourcePath: string,
  encodedPath: string,
  qualityTier: QualityTier
): Promise<VmafResult> {
  const logFile = join(tmpdir(), `vmaf_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)

  try {
    // Use FFmpeg libvmaf filter: distorted=encodedPath, reference=sourcePath
    await execFileAsync('ffmpeg', [
      '-i', encodedPath,
      '-i', sourcePath,
      '-lavfi', `[0:v][1:v]libvmaf=log_fmt=json:log_path=${logFile}`,
      '-f', 'null',
      '-',
    ])

    const logContent = await readFile(logFile, 'utf-8')
    const vmafLog = JSON.parse(logContent) as { pooled_metrics?: { vmaf?: { mean?: number } } }
    const score = vmafLog?.pooled_metrics?.vmaf?.mean ?? 0

    const threshold = VMAF_THRESHOLDS[qualityTier]
    return {
      score,
      meetsThreshold: score >= threshold,
      threshold,
      qualityTier,
    }
  } finally {
    await unlink(logFile).catch(() => {
      // ignore cleanup errors
    })
  }
}

/**
 * Check whether a VMAF score meets the threshold for a given quality tier.
 */
export function checkVmafThreshold(score: number, qualityTier: QualityTier): boolean {
  return score >= VMAF_THRESHOLDS[qualityTier]
}

export interface QualityShortfall {
  assetId: string
  renditionId: string
  targetVmaf: number
  achievedVmaf: number
  qualityTier: QualityTier
}

/**
 * Log a VMAF shortfall and return the shortfall record.
 */
export function recordQualityShortfall(
  assetId: string,
  renditionId: string,
  achievedVmaf: number,
  qualityTier: QualityTier
): QualityShortfall {
  const targetVmaf = VMAF_THRESHOLDS[qualityTier]
  logger.warn(
    `[vmaf] Quality shortfall for asset ${assetId} rendition ${renditionId}: ` +
    `achieved ${achievedVmaf.toFixed(2)} vs target ${targetVmaf} (${qualityTier})`
  )
  return { assetId, renditionId, targetVmaf, achievedVmaf, qualityTier }
}
