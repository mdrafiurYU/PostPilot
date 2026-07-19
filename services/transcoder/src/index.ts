import { createLogger } from '@postpilot/logger'
const logger = createLogger('transcoder')

// Transcoder — main worker
// Consumes asset.compressed events; generates platform-specific adaptations.
// Requirements: 1.3, 1.4, 1.5

import express, { type Express, type Request, type Response } from 'express'
import type { AssetCompressedEvent } from '@postpilot/events'
import type { Adaptation } from '@postpilot/types'
import { PLATFORM_VARIANTS } from './platformVariants.js'
import { encodeAdaptation, probeVideoDimensions } from './adaptationPipeline.js'
import { uploadToS3 } from './s3.js'
import { publishEvent, subscribe, startConsuming } from './messageBus.js'
import { getAssetById, updateAssetStatus, upsertAdaptation } from './db.js'
import { unlink } from 'fs/promises'

// ─── Main adaptation handler ──────────────────────────────────────────────────

async function handleAssetCompressed(event: AssetCompressedEvent): Promise<void> {
  const { assetId, renditions } = event.payload

  logger.info(`[transcoder] processing asset ${assetId} (${renditions.length} renditions)`)

  const asset = await getAssetById(assetId)
  if (!asset) {
    logger.error(`[transcoder] asset ${assetId} not found`)
    return
  }

  await updateAssetStatus(assetId, 'adapting')

  // Use the highest-quality rendition (largest file) as the source for adaptation.
  // In production this would be downloaded from S3; here we use the s3_key path as a proxy.
  const sourceRendition = renditions.reduce((best, r) =>
    r.file_size_bytes > best.file_size_bytes ? r : best,
  )
  // In production: download from S3 to a temp path
  const localSourcePath = `/tmp/${assetId}_source_for_adaptation.mp4`

  const adaptations: Adaptation[] = []

  try {
    // Probe source dimensions once
    let srcWidth = 1920
    let srcHeight = 1080
    try {
      const dims = await probeVideoDimensions(localSourcePath)
      srcWidth = dims.width
      srcHeight = dims.height
    } catch {
      // Fall back to rendition metadata if probe fails
      srcWidth = sourceRendition.width
      srcHeight = sourceRendition.height
    }

    logger.info(`[transcoder] source dimensions: ${srcWidth}x${srcHeight}`)

    // Generate all 7 platform adaptations
    for (const variant of PLATFORM_VARIANTS) {
      const adaptationId = crypto.randomUUID()
      const s3Key = `assets/${assetId}/adaptations/${variant.platform}_${variant.formatVariant}_${variant.aspectRatio.replace(':', 'x')}.mp4`

      logger.info(
        `[transcoder] encoding ${variant.platform}/${variant.formatVariant} (${variant.aspectRatio})`,
      )

      let status: Adaptation['status'] = 'pending'
      let outputPath: string | undefined

      try {
        const result = await encodeAdaptation(localSourcePath, variant, srcWidth, srcHeight)
        outputPath = result.outputPath

        await uploadToS3(outputPath, s3Key)
        status = 'ready'

        logger.info(
          `[transcoder] ✓ ${variant.platform}/${variant.formatVariant} → ${s3Key} (${result.fileSizeBytes} bytes)`,
        )
      } catch (err) {
        status = 'failed'
        logger.error(
          { err: err instanceof Error ? err : new Error(String(err)) },
          `[transcoder] ✗ ${variant.platform}/${variant.formatVariant} failed`,
        )
      } finally {
        if (outputPath) {
          await unlink(outputPath).catch(() => undefined)
        }
      }

      const adaptation: Adaptation = {
        id: adaptationId,
        asset_id: assetId,
        platform: variant.platform,
        format_variant: variant.formatVariant,
        aspect_ratio: variant.aspectRatio,
        codec: variant.codec,
        s3_key: s3Key,
        status,
        created_at: new Date(),
      }

      await upsertAdaptation(adaptation)
      adaptations.push(adaptation)
    }

    const readyCount = adaptations.filter((a) => a.status === 'ready').length
    const failedCount = adaptations.filter((a) => a.status === 'failed').length

    if (failedCount > 0) {
      logger.warn(`[transcoder] ${failedCount} adaptation(s) failed for asset ${assetId}`)
    }

    // Update asset status based on outcome
    const allFailed = readyCount === 0
    await updateAssetStatus(assetId, allFailed ? 'failed' : 'adapted')

    // Emit asset.adapted event (Req 1.3)
    await publishEvent({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'asset.adapted',
      payload: {
        assetId,
        adaptations,
      },
    })

    logger.info(
      `[transcoder] asset ${assetId} adapted: ${readyCount}/${adaptations.length} variants ready`,
    )
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[transcoder] fatal error processing asset ${assetId}`,
    )
    await updateAssetStatus(assetId, 'failed')
  }
}

// ─── Cloud Run HTTP Health Server ───────────────────────────────────────────
const app: Express = express()

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'transcoder',
  })
})

const PORT = Number(process.env.PORT || 8080)

app.listen(PORT, () => {
  logger.info(`[transcoder] health server listening on port ${PORT}`)
})

// ─── Worker startup ─────────────────────────────────────────────────────────

async function startWorker() {
  try {
    await startConsuming()

    subscribe<AssetCompressedEvent>(
      'asset.compressed',
      handleAssetCompressed,
    )

    logger.info(
      '[transcoder] worker started, listening for asset.compressed events',
    )
  } catch (err) {
    logger.error(
      {
        err:
          err instanceof Error
            ? err
            : new Error(String(err)),
      },
      '[transcoder] failed to start worker',
    )

    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  startWorker()
}

export { app, handleAssetCompressed }
