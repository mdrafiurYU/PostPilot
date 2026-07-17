import { createLogger } from '@postpilot/logger'
const logger = createLogger('compression-engine')

// Compression Engine — main worker
// Consumes asset.uploaded events; produces bitrate ladders, VMAF scores, HLS manifests.
// Requirements: 7.1–7.11

import express, { type Express, type Request, type Response } from 'express'
import type { AssetUploadedEvent } from '@postpilot/events'
import type { Rendition, Adaptation } from '@postpilot/types'
import { selectCodec, PLATFORM_CAPABILITIES } from './codecSelection.js'
import {
  analyzeContent,
  adjustBitrateForContent,
  probeVideo,
  encodeRendition,
  RENDITION_SPECS,
} from './encodingPipeline.js'
import { computeVmaf, checkVmafThreshold, recordQualityShortfall } from './vmafScoring.js'
import { generateHlsManifest } from './manifestGeneration.js'
import { convertToWebP, isImageFormat } from './imageConversion.js'
import { uploadToS3, uploadStringToS3 } from './s3.js'
import { subscribe, publishEvent, startConsuming, disconnect } from './messageBus.js'
import {
  getAssetById,
  updateAssetStatus,
  insertRendition,
  getRenditionsByAssetId,
  upsertAdaptation,
} from './db.js'
import { unlink } from 'fs/promises'

// ─── Creator tier lookup (stub) ───────────────────────────────────────────────

type CreatorTier = 'free' | 'pro' | 'enterprise'

async function getCreatorTier(_creatorId: string): Promise<CreatorTier> {
  // In production: query creator service or DB
  return (process.env.DEFAULT_CREATOR_TIER as CreatorTier) ?? 'free'
}

// ─── Main compression handler ─────────────────────────────────────────────────

async function handleAssetUploaded(event: AssetUploadedEvent): Promise<void> {
  const { assetId, creatorId, s3Key, mediaType, format } = event.payload

  logger.info(`[compression-engine] processing asset ${assetId} (${mediaType}/${format})`)

  const asset = await getAssetById(assetId)
  if (!asset) {
    logger.error(`[compression-engine] asset ${assetId} not found`)
    return
  }

  await updateAssetStatus(assetId, 'compressing')

  try {
    if (mediaType === 'image') {
      await processImageAsset(assetId, s3Key, format)
    } else {
      await processVideoAsset(assetId, creatorId, s3Key, asset.file_size_bytes)
    }

    await updateAssetStatus(assetId, 'compressed')
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[compression-engine] failed to compress asset ${assetId}`,
    )
    await updateAssetStatus(assetId, 'failed')
  }
}

// ─── Image processing (Task 3.8) ─────────────────────────────────────────────

async function processImageAsset(assetId: string, s3Key: string, format: string): Promise<void> {
  if (!isImageFormat(format)) {
    logger.warn(`[compression-engine] unsupported image format: ${format}`)
    return
  }

  // In production: download from S3 to a temp path
  const localPath = `/tmp/${assetId}_original.${format}`

  const result = await convertToWebP(localPath)
  const webpS3Key = s3Key.replace(/\.[^.]+$/, '.webp')
  await uploadToS3(result.outputPath, webpS3Key)

  if (!result.meetsTarget) {
    logger.warn(
      `[compression-engine] WebP conversion for ${assetId} achieved ` +
        `${(result.compressionRatio * 100).toFixed(1)}% of original size ` +
        `(target: ≤75%)`,
    )
  }

  logger.info(
    `[compression-engine] image ${assetId} converted to WebP: ` +
      `${result.originalSizeBytes} → ${result.webpSizeBytes} bytes ` +
      `(${(result.compressionRatio * 100).toFixed(1)}%)`,
  )

  // Cleanup temp file
  await unlink(result.outputPath).catch(() => undefined)
}

// ─── Video processing (Tasks 3.3, 3.5, 3.10, 3.12) ──────────────────────────

async function processVideoAsset(
  assetId: string,
  creatorId: string,
  s3Key: string,
  sourceFileSizeBytes: number,
): Promise<void> {
  // In production: download from S3 to a temp path
  const localSourcePath = `/tmp/${assetId}_source.mp4`

  // 1. Probe source video metadata
  const probe = await probeVideo(localSourcePath)
  logger.info(
    `[compression-engine] probed ${assetId}: ${probe.width}x${probe.height}, ${probe.durationSeconds}s, audio: ${probe.audioChannelLayout}`,
  )

  // 2. Analyze content for adaptive bitrate allocation (Req 7.4)
  const contentAnalysis = await analyzeContent(localSourcePath)
  logger.info(
    `[compression-engine] content analysis: complexity=${contentAnalysis.sceneComplexity.toFixed(2)}, motion=${contentAnalysis.motionLevel.toFixed(2)}`,
  )

  // 3. Select codec based on platform capabilities and creator tier (Req 7.1, 7.2)
  const creatorTier = await getCreatorTier(creatorId)
  // Use YouTube capabilities as the default for the bitrate ladder (most permissive)
  const platformCaps = PLATFORM_CAPABILITIES['youtube']
  const codec = selectCodec(platformCaps, creatorTier)
  logger.info(`[compression-engine] selected codec: ${codec} (tier: ${creatorTier})`)

  // 4. Encode renditions (Req 7.3)
  const renditions: Rendition[] = []
  const qualityShortfalls: Array<{ renditionId: string; achievedVmaf: number; tier: string }> = []

  for (const spec of RENDITION_SPECS) {
    // Skip renditions higher than source resolution
    if (spec.height > probe.height) {
      logger.info(`[compression-engine] skipping ${spec.resolution} (source is ${probe.height}p)`)
      continue
    }

    const bitrateKbps = adjustBitrateForContent(spec.baseBitrateKbps, contentAnalysis)
    logger.info(`[compression-engine] encoding ${spec.resolution} at ${bitrateKbps} kbps`)

    // Encode rendition (includes audio preservation per Req 7.11)
    const encoded = await encodeRendition(
      localSourcePath,
      spec,
      codec,
      bitrateKbps,
      probe.audioChannelLayout,
      probe.width,
      probe.height,
    )

    // 5. Compute VMAF score (Req 7.5)
    const vmafResult = await computeVmaf(localSourcePath, encoded.outputPath, spec.qualityTier)
    logger.info(
      `[compression-engine] ${spec.resolution} VMAF: ${vmafResult.score.toFixed(2)} (threshold: ${vmafResult.threshold})`,
    )

    const renditionId = crypto.randomUUID()
    const renditionS3Key = `assets/${assetId}/renditions/${spec.resolution}_${codec}.mp4`

    // Upload rendition to S3
    await uploadToS3(encoded.outputPath, renditionS3Key)

    // 6. Check VMAF quality gate (Req 7.5, 7.10)
    if (!vmafResult.meetsThreshold) {
      const shortfall = recordQualityShortfall(
        assetId,
        renditionId,
        vmafResult.score,
        spec.qualityTier,
      )
      qualityShortfalls.push({
        renditionId,
        achievedVmaf: vmafResult.score,
        tier: spec.qualityTier,
      })

      // Emit quality shortfall event (Req 7.10)
      await publishEvent({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: 'asset.quality_shortfall',
        payload: {
          assetId,
          renditionId,
          targetVmaf: shortfall.targetVmaf,
          achievedVmaf: shortfall.achievedVmaf,
        },
      })
    }

    // 7. Persist rendition record (retain best rendition even on shortfall — Req 7.10)
    const rendition: Rendition = {
      id: renditionId,
      asset_id: assetId,
      codec,
      resolution: spec.resolution,
      width: encoded.width,
      height: encoded.height,
      bitrate_kbps: encoded.bitrateKbps,
      vmaf_score: vmafResult.score,
      file_size_bytes: encoded.fileSizeBytes,
      s3_key: renditionS3Key,
      created_at: new Date(),
    }

    await insertRendition(rendition)
    renditions.push(rendition)

    // Cleanup temp file
    await unlink(encoded.outputPath).catch(() => undefined)
  }

  // Ensure we have at least 3 renditions (Req 7.3)
  if (renditions.length < 3) {
    logger.warn(
      `[compression-engine] only ${renditions.length} renditions produced for ${assetId} (source may be low resolution)`,
    )
  }

  // 8. Generate HLS manifest (Req 7.8)
  const manifest = generateHlsManifest(renditions)
  const manifestS3Key = `assets/${assetId}/manifest.m3u8`
  await uploadStringToS3(manifest, manifestS3Key)

  // 9. Persist adaptation record with manifest
  const adaptation: Adaptation = {
    id: crypto.randomUUID(),
    asset_id: assetId,
    platform: 'youtube', // default platform for the master ladder
    format_variant: 'hls',
    aspect_ratio: `${probe.width}:${probe.height}`,
    codec,
    s3_key: `assets/${assetId}/renditions/`,
    manifest_s3_key: manifestS3Key,
    status: 'ready',
    created_at: new Date(),
  }
  await upsertAdaptation(adaptation)

  // 10. Emit asset.compressed event (Req 7.8)
  await publishEvent({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: 'asset.compressed',
    payload: {
      assetId,
      renditions,
    },
  })

  logger.info(
    `[compression-engine] asset ${assetId} compressed: ${renditions.length} renditions, manifest at ${manifestS3Key}`,
  )

  if (qualityShortfalls.length > 0) {
    logger.warn(
      `[compression-engine] ${qualityShortfalls.length} quality shortfall(s) for asset ${assetId}`,
    )
  }
}

// ─── Cloud Run HTTP Health Server ─────────────────────────────────────────────

const app: Express = express()

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'compression-engine',
  })
})

const PORT = Number(process.env.PORT || 8080)

app.listen(PORT, '0.0.0.0', () => {
  logger.info(
    `[compression-engine] health server listening on port ${PORT}`,
  )
})


// ─── Worker startup ───────────────────────────────────────────────────────────

async function startWorker() {

  try {

    subscribe<AssetUploadedEvent>(
      'asset.uploaded',
      handleAssetUploaded,
    )

    await startConsuming()

    logger.info(
      '[compression-engine] worker started, listening for asset.uploaded events',
    )
  } catch (err) {

    logger.error(
      {
        err:
          err instanceof Error
            ? err
            : new Error(String(err)),
      },
      '[compression-engine] failed to start worker',
    )

    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  startWorker()
}

process.on('SIGTERM', async () => {
  logger.info(
    '[compression-engine] shutting down',
  )
  await disconnect()
  process.exit(0)
})

export { handleAssetUploaded, app }