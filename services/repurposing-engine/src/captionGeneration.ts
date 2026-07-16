import { createLogger } from '@postpilot/logger'
const logger = createLogger('repurposing-engine')

// Caption generation module for the Repurposing Engine
// Calls Groq llama-3.3-70b-versatile to generate platform-appropriate captions for each clip.

import { randomUUID } from 'crypto'
import type { Clip, Caption, Platform } from '@postpilot/types'
import { insertCaption } from './db.js'

// ─── Constants ────────────────────────────────────────────────────────────

export const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  tiktok: 500,
  linkedin: 5000,
  youtube: 5000,
  facebook: 63206,
}

export const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook']

// ─── Character limit enforcement ──────────────────────────────────────────

/**
 * Truncates text to the platform's character limit at a word boundary.
 * Appends "..." if truncation occurred.
 */
export function enforceCharLimit(text: string, platform: Platform): string {
  const limit = PLATFORM_CHAR_LIMITS[platform]
  if (text.length <= limit) return text

  // Truncate at word boundary — leave room for "..."
  const truncated = text.slice(0, limit - 3)
  const lastSpace = truncated.lastIndexOf(' ')
  const cutPoint = lastSpace > 0 ? lastSpace : limit - 3
  return text.slice(0, cutPoint) + '...'
}

// ─── Caption + hashtag assembly ───────────────────────────────────────────

/**
 * Appends hashtags to caption text and enforces the platform character limit
 * on the combined result.
 */
export function buildCaptionWithHashtags(
  captionText: string,
  hashtags: string[],
  platform: Platform
): string {
  if (hashtags.length === 0) return enforceCharLimit(captionText, platform)

  const hashtagString = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const combined = `${captionText}

${hashtagString}`
  return enforceCharLimit(combined, platform)
}

// ─── LLM caption generation ───────────────────────────────────────────────

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

/**
 * Calls Groq llama-3.3-70b-versatile to generate a platform-appropriate caption for a clip.
 * Returns a stub caption when GROQ_API_KEY is not set.
 */
export async function generateCaption(
  clip: Clip,
  platform: Platform,
  hashtags: string[],
  transcriptionText: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    logger.info(
      `[captionGeneration] GROQ_API_KEY not set — returning stub caption for clip ${clip.id} on ${platform}`
    )
    const stubText = `Check out this amazing clip! Perfect for ${platform}. Duration: ${clip.duration_seconds}s.`
    return buildCaptionWithHashtags(stubText, hashtags, platform)
  }

  const charLimit = PLATFORM_CHAR_LIMITS[platform]
  const hashtagHint =
    hashtags.length > 0
      ? `Embed these hashtags naturally in the caption: ${hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}.`
      : 'Do not add hashtags.'

  const prompt = `You are a social media copywriter. Write a ${platform} caption for a video clip.

Platform: ${platform}
Character limit: ${charLimit} characters (STRICT — do not exceed)
Clip duration: ${clip.duration_seconds} seconds
Transcription excerpt: "${transcriptionText.slice(0, 500)}"

${hashtagHint}

Write only the caption text. No explanations, no quotes around the output.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: Math.min(Math.ceil(charLimit / 3), 2048),
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as GroqChatResponse
  const rawCaption = data.choices[0]?.message?.content?.trim() ?? ''

  // Enforce character limit as a safety net even if the model respected it
  return enforceCharLimit(rawCaption, platform)
}

// ─── Per-clip caption generation ──────────────────────────────────────────

/**
 * Generates one Caption per platform for the given clip, persists each via
 * db.insertCaption, and returns all persisted Caption records.
 */
export async function generateCaptionsForClip(
  clip: Clip,
  hashtags: string[],
  transcriptionText: string
): Promise<Caption[]> {
  const captions: Caption[] = []

  for (const platform of PLATFORMS) {
    const text = await generateCaption(clip, platform, hashtags, transcriptionText)

    const caption: Caption = {
      id: randomUUID(),
      clip_id: clip.id,
      asset_id: clip.asset_id,
      platform,
      text,
      character_count: text.length,
      hashtags,
      created_at: new Date(),
    }

    const saved = await insertCaption(caption)
    captions.push(saved)
  }

  logger.info(
    `[captionGeneration] generated ${captions.length} caption(s) for clip ${clip.id}`
  )

  return captions
}
