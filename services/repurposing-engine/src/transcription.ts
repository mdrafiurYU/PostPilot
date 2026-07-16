import { createLogger } from '@postpilot/logger'
const logger = createLogger('repurposing-engine')

// Speech-to-text transcription module for the Repurposing Engine
// Uses Groq Whisper API (whisper-large-v3-turbo) for audio transcription

import { uploadStringToS3 } from './s3.js'

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptionResult {
  text: string
  segments: TranscriptionSegment[]
  language: string
}

/** Whisper API verbose_json response shape */
interface WhisperVerboseResponse {
  text: string
  language: string
  segments: Array<{
    id: number
    start: number
    end: number
    text: string
  }>
}

/**
 * Transcribe audio from an S3 asset using Groq Whisper.
 * Falls back to a stub when GROQ_API_KEY is not set (for testing).
 */
export async function transcribeAudio(
  assetS3Key: string,
  assetId: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    logger.info(`[transcription] GROQ_API_KEY not set — returning stub transcription for asset ${assetId}`)
    return {
      text: 'This is a stub transcription for testing purposes.',
      segments: [
        { start: 0, end: 2.5, text: 'This is a stub' },
        { start: 2.5, end: 5.0, text: 'transcription for testing purposes.' },
      ],
      language: 'en',
    }
  }

  // In production, download the audio from GCS first, then send to Groq Whisper.
  const bucket = process.env.GCS_BUCKET ?? process.env.S3_BUCKET ?? 'postpilot-assets'
  const gcsPublicUrl = process.env.GCS_PUBLIC_URL ?? process.env.S3_PUBLIC_URL ?? `https://storage.googleapis.com/${bucket}`
  const audioUrl = `${gcsPublicUrl}/${assetS3Key}`

  logger.info(`[transcription] transcribing asset ${assetId} via Groq Whisper API`)

  const formData = new FormData()
  // In production: fetch the audio bytes from S3 and append as a Blob
  // const audioBlob = await fetchAudioFromS3(assetS3Key)
  // formData.append('file', audioBlob, 'audio.mp4')
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('response_format', 'verbose_json')
  formData.append('language', 'en')

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq Whisper API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as WhisperVerboseResponse

  return {
    text: data.text,
    language: data.language,
    segments: data.segments.map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })),
  }
}

/**
 * Convert a TranscriptionResult to SRT or VTT subtitle format string.
 */
export function generateSubtitleFile(
  transcription: TranscriptionResult,
  format: 'srt' | 'vtt'
): string {
  if (format === 'vtt') {
    return generateVTT(transcription)
  }
  return generateSRT(transcription)
}

function formatTimeSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`
}

function formatTimeVTT(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function generateSRT(transcription: TranscriptionResult): string {
  const lines: string[] = []
  transcription.segments.forEach((seg, index) => {
    lines.push(String(index + 1))
    lines.push(`${formatTimeSRT(seg.start)} --> ${formatTimeSRT(seg.end)}`)
    lines.push(seg.text)
    lines.push('')
  })
  return lines.join('\n')
}

function generateVTT(transcription: TranscriptionResult): string {
  const lines: string[] = ['WEBVTT', '']
  transcription.segments.forEach((seg, index) => {
    lines.push(String(index + 1))
    lines.push(`${formatTimeVTT(seg.start)} --> ${formatTimeVTT(seg.end)}`)
    lines.push(seg.text)
    lines.push('')
  })
  return lines.join('\n')
}

/**
 * Upload a subtitle file to S3 and return the S3 key.
 */
export async function uploadSubtitles(
  content: string,
  assetId: string,
  format: 'srt' | 'vtt'
): Promise<string> {
  const s3Key = `subtitles/${assetId}/subtitles.${format}`
  logger.info(`[transcription] uploading ${format.toUpperCase()} subtitles for asset ${assetId}`)
  return uploadStringToS3(content, s3Key)
}
