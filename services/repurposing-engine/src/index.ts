import { createLogger } from '@postpilot/logger'
const logger = createLogger('repurposing-engine')

// Repurposing Engine
// Consumes asset.adapted events; transcribes audio, extracts clips, generates captions, emits asset.repurposed.

import { randomUUID } from 'crypto'
import express, { type Express, type Request, type Response } from 'express'
import type { AssetAdaptedEvent, AssetRepurposedEvent } from '@postpilot/events'
import type { Clip } from '@postpilot/types'
import { subscribe, publishEvent, startConsuming } from './messageBus.js'
import { transcribeAudio, generateSubtitleFile, uploadSubtitles } from './transcription.js'
import { insertClip, updateClipSubtitlesKey, getClipsByAssetId } from './db.js'
import {
  detectScenes,
  scoreSegments,
  selectClips,
  extractClip,
  canExtractClips,
} from './sceneDetection.js'
import { generateCaptionsForClip } from './captionGeneration.js'

const MIN_DURATION_FOR_CLIPS = 60 // seconds — only extract clips from videos longer than this
const MIN_CLIPS = 3
const MAX_CLIPS = 10
const MIN_CLIP_DURATION = 15 // seconds
const MAX_CLIP_DURATION = 90 // seconds

async function handleAssetAdapted(event: AssetAdaptedEvent): Promise<void> {

  const { assetId, adaptations } = event.payload

  logger.info(`[repurposing-engine] processing asset.adapted for asset ${assetId}`)

  // Only process video assets (adaptations will have video codecs)
  const videoAdaptations = adaptations.filter(
    (a) => a.codec === 'h264' || a.codec === 'h265' || a.codec === 'av1',
  )

  if (videoAdaptations.length === 0) {
    logger.info(`[repurposing-engine] no video adaptations for asset ${assetId}, skipping`)
    return
  }

  const sourceAdaptation = videoAdaptations[0]
  logger.info(`[repurposing-engine] processing asset.adapted for asset ${assetId}`)

  try {
    // 1. Transcribe audio
    const transcription = await transcribeAudio(sourceAdaptation.s3_key, assetId)
    logger.info(
      `[repurposing-engine] transcription complete: "${transcription.text.slice(0, 80)}..."`,
    )

    // 2. Generate SRT subtitle file and upload to S3
    const srtContent = generateSubtitleFile(transcription, 'srt')
    const subtitlesS3Key = await uploadSubtitles(srtContent, assetId, 'srt')

    // 3. Scene detection and clip extraction (only for videos > 60s)
    const durationSeconds = sourceAdaptation.format_variant
      ? parseFloat(sourceAdaptation.format_variant) || 120
      : 120 // default assumption when duration is unknown

    const persistedClips: Clip[] = []

    if (durationSeconds > MIN_DURATION_FOR_CLIPS) {
      const candidates = await detectScenes(sourceAdaptation.s3_key, durationSeconds)
      const scored = scoreSegments(candidates, transcription.segments)
      const selected = selectClips(
        scored,
        MIN_CLIPS,
        MAX_CLIPS,
        MIN_CLIP_DURATION,
        MAX_CLIP_DURATION,
      )

      if (!canExtractClips(scored)) {
        logger.warn(
          `[repurposing-engine] asset ${assetId} is silent and static — no clips extracted`,
        )
      } else {
        // Extract and persist each selected clip
        for (let i = 0; i < selected.length; i++) {
          const candidate = selected[i]
          const clipS3Key = await extractClip(sourceAdaptation.s3_key, assetId, candidate, i)

          const clip: Clip = {
            id: randomUUID(),
            asset_id: assetId,
            start_seconds: candidate.startSeconds,
            end_seconds: candidate.endSeconds,
            duration_seconds: candidate.endSeconds - candidate.startSeconds,
            engagement_score: candidate.engagementScore,
            s3_key: clipS3Key,
            subtitles_s3_key: subtitlesS3Key,
            captions: [],
            created_at: new Date(),
          }

          const saved = await insertClip(clip)
          persistedClips.push(saved)
        }

        logger.info(
          `[repurposing-engine] extracted ${persistedClips.length} clip(s) for asset ${assetId}`,
        )
      }
    } else {
      logger.info(
        `[repurposing-engine] asset ${assetId} is ${durationSeconds}s — skipping clip extraction (< ${MIN_DURATION_FOR_CLIPS}s)`,
      )
    }

    // 4. Update any pre-existing clips with the subtitles S3 key
    const existingClips = await getClipsByAssetId(assetId)
    const clipsNeedingSubtitles = existingClips.filter(
      (c) => !persistedClips.some((p) => p.id === c.id),
    )
    await Promise.all(
      clipsNeedingSubtitles.map((clip) => updateClipSubtitlesKey(clip.id, subtitlesS3Key)),
    )

    logger.info(`[repurposing-engine] subtitles stored at ${subtitlesS3Key} for asset ${assetId}`)

    // 5. Generate captions for each extracted clip (hashtags come from Targeting Engine later)
    const allCaptions = []
    for (const clip of persistedClips) {
      const clipCaptions = await generateCaptionsForClip(clip, [], transcription.text)
      allCaptions.push(...clipCaptions)
    }

    logger.info(
      `[repurposing-engine] generated ${allCaptions.length} caption(s) for asset ${assetId}`,
    )

    // 6. Emit asset.repurposed with persisted clips and all captions
    const repurposedEvent: AssetRepurposedEvent = {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'asset.repurposed',
      payload: {
        assetId,
        clips: persistedClips,
        captions: allCaptions,
      },
    }
    await publishEvent(repurposedEvent)
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      `[repurposing-engine] processing failed for asset ${assetId}`,
    )
  }
}

// ─── Cloud Run HTTP Health Server ───────────────────────────────────────────
const app: Express = express()

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'repurposing-engine',
  })
})

const PORT = Number(process.env.PORT || 8080)

app.listen(PORT, () => {
  logger.info(`[repurposing-engine] health server listening on port ${PORT}`)
})

// ─── Worker startup ─────────────────────────────────────────────────────────
async function startWorker(){
  try {
    await startConsuming()

    subscribe<AssetAdaptedEvent>(
      'asset.adapted',
      async(event)=>{
        await handleAssetAdapted(event)
      }
    )
    logger.info('[repurposing-engine] worker started')
  } catch(err) {
    logger.error(
      {
        err:
          err instanceof Error
          ? err
          : new Error(String(err))
      },
      '[repurposing-engine] startup failed'
    )
    process.exit(1)
  }
}

if(process.env.NODE_ENV !== 'test'){
  startWorker()
}

export { handleAssetAdapted, app }
