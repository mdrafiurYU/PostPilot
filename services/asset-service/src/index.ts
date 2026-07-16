import { createLogger, requestIdMiddleware } from '@postpilot/logger'
const logger = createLogger('asset-service')

// Asset Service — Express HTTP server

import express, { Express } from 'express'
import type { Request, Response } from 'express'
import { validateUpload } from './validation.js'
import {
  insertAsset,
  getAssetById,
  updateAssetStatus,
  getAdaptationsByAssetId,
  softDeleteAsset,
} from './db.js'
import { generatePresignedUploadUrl, deleteGcsObject } from './gcs.js'
import { publishEvent } from './messageBus.js'

const app: Express = express()
app.use(express.json())
app.use(requestIdMiddleware(logger))

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
}

// POST /assets — initiate an asset upload
app.post('/assets', async (req: Request, res: Response) => {
  const { filename, file_size_bytes, creator_id } = req.body as {
    filename?: unknown
    file_size_bytes?: unknown
    creator_id?: unknown
  }

  if (typeof filename !== 'string' || !filename) {
    return res
      .status(422)
      .json({ errors: [{ field: 'filename', message: 'filename is required' }] })
  }
  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) {
    return res
      .status(422)
      .json({
        errors: [
          { field: 'file_size_bytes', message: 'file_size_bytes must be a positive number' },
        ],
      })
  }
  if (typeof creator_id !== 'string' || !creator_id) {
    return res
      .status(422)
      .json({ errors: [{ field: 'creator_id', message: 'creator_id is required' }] })
  }

  const validation = validateUpload(filename, file_size_bytes)
  if (!validation.valid) {
    return res.status(422).json({ errors: validation.errors })
  }

  const id = crypto.randomUUID()
  const s3Key = `assets/${id}/original/${filename}`
  const contentType = CONTENT_TYPES[validation.format]
  const now = new Date()

  const uploadUrl = await generatePresignedUploadUrl(s3Key, contentType, 3600)

  const asset = await insertAsset({
    id,
    creator_id,
    filename,
    media_type: validation.mediaType,
    format: validation.format,
    file_size_bytes,
    s3_key: s3Key,
    status: 'uploading',
    created_at: now,
    updated_at: now,
  })

  return res.status(201).json({ asset, uploadUrl })
})

// POST /assets/:id/confirm — confirm upload complete and emit event
app.post('/assets/:id/confirm', async (req: Request, res: Response) => {
  const { id } = req.params

  const asset = await getAssetById(id)
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' })
  }

  if (asset.status !== 'uploading') {
    return res.status(409).json({ error: 'Asset is not in uploading state' })
  }

  await updateAssetStatus(id, 'uploaded')

  await publishEvent({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: 'asset.uploaded',
    payload: {
      assetId: asset.id,
      creatorId: asset.creator_id,
      s3Key: asset.s3_key,
      mediaType: asset.media_type,
      format: asset.format,
      fileSizeBytes: asset.file_size_bytes,
    },
  })

  return res.status(200).json({ success: true })
})

// GET /assets/:id — return asset metadata and current status
app.get('/assets/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const asset = await getAssetById(id)
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' })
  }
  return res.status(200).json(asset)
})

// GET /assets/:id/adaptations — list all adaptations for the asset
app.get('/assets/:id/adaptations', async (req: Request, res: Response) => {
  const { id } = req.params
  const asset = await getAssetById(id)
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' })
  }
  const adaptations = await getAdaptationsByAssetId(id)
  return res.status(200).json({ adaptations })
})

// DELETE /assets/:id — soft-delete asset and all derived GCS objects
app.delete('/assets/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const asset = await getAssetById(id)
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' })
  }

  await softDeleteAsset(id)
  await deleteGcsObject(asset.s3_key)

  const adaptations = await getAdaptationsByAssetId(id)
  for (const adaptation of adaptations) {
    try {
      await deleteGcsObject(adaptation.s3_key)
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : new Error(String(err)) },
        '[asset-service] failed to delete GCS object',
      )
    }
  }

  return res.status(204).send()
})

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'asset-service', uptime: process.uptime() })
})

const PORT = process.env.PORT ?? 3001

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`[asset-service] listening on port ${PORT}`)
  })
}

export { app }
