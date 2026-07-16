import { createLogger } from '@postpilot/logger'
const logger = createLogger('analytics-engine')

// Insight generation — calls LLM to produce exactly 3 InsightFactor entries
// after metrics are ingested. Excludes null metric fields from calculations.
// Requirements: 5.2, 5.3, 5.6

import type { PostMetrics, Insight, InsightFactor } from '@postpilot/types'
import { getPostById, getChannelById, insertInsight, getInsightByPostId } from './db.js'

// ─── LLM stub ─────────────────────────────────────────────────────────────────
// Production: calls Groq llama-3.3-70b-versatile for structured insight generation.

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface LLMInsightResponse {
  factors: Array<{
    label: string
    description: string
    impact: 'positive' | 'negative'
    magnitude: 'low' | 'medium' | 'high'
  }>
  recommendation?: string
}

async function callLLM(prompt: string): Promise<LLMInsightResponse> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    // Stub: returns deterministic factors when GROQ_API_KEY is not set
    logger.info('[analytics-engine] GROQ_API_KEY not set — returning stub insight')
    return {
      factors: [
        {
          label: 'Engagement rate',
          description: 'Your engagement rate was above your channel average, driven by strong early interactions.',
          impact: 'positive',
          magnitude: 'high',
        },
        {
          label: 'View count',
          description: 'This post received fewer views than your typical content, suggesting the hook could be stronger.',
          impact: 'negative',
          magnitude: 'medium',
        },
        {
          label: 'Share velocity',
          description: 'Shares in the first 2 hours were 30% higher than your average, indicating strong resonance.',
          impact: 'positive',
          magnitude: 'medium',
        },
      ],
      recommendation: undefined,
    }
  }

  logger.info('[analytics-engine] calling Groq for insight generation')

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a social media performance analyst. Always respond with valid JSON only — no markdown, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as GroqChatResponse
  const raw = data.choices[0]?.message?.content?.trim() ?? '{}'

  try {
    return JSON.parse(raw) as LLMInsightResponse
  } catch {
    throw new Error(`[analytics-engine] failed to parse Groq insight response: ${raw}`)
  }
}

// ─── Build LLM prompt ─────────────────────────────────────────────────────────

function buildInsightPrompt(metrics: PostMetrics, channelAvg: Partial<PostMetrics>): string {
  // Only include non-null metric fields (Requirement 5.6)
  const available: string[] = []

  if (metrics.views != null) available.push(`views: ${metrics.views} (channel avg: ${channelAvg.views ?? 'n/a'})`)
  if (metrics.likes != null) available.push(`likes: ${metrics.likes} (channel avg: ${channelAvg.likes ?? 'n/a'})`)
  if (metrics.comments != null) available.push(`comments: ${metrics.comments} (channel avg: ${channelAvg.comments ?? 'n/a'})`)
  if (metrics.shares != null) available.push(`shares: ${metrics.shares} (channel avg: ${channelAvg.shares ?? 'n/a'})`)
  if (metrics.watch_time_seconds != null) available.push(`watch_time_seconds: ${metrics.watch_time_seconds} (channel avg: ${channelAvg.watch_time_seconds ?? 'n/a'})`)
  if (metrics.engagement_rate != null) available.push(`engagement_rate: ${(metrics.engagement_rate * 100).toFixed(2)}% (channel avg: ${channelAvg.engagement_rate != null ? (channelAvg.engagement_rate * 100).toFixed(2) + '%' : 'n/a'})`)

  return [
    'You are a social media performance analyst. Analyze the following post metrics and identify exactly 3 key factors that explain the post\'s performance relative to the channel average.',
    'Express each factor in plain English without technical jargon.',
    'Return exactly 3 factors as a JSON array.',
    '',
    'Available metrics:',
    ...available,
  ].join('\n')
}

// ─── Compute channel average metrics ─────────────────────────────────────────

export function computeChannelAverage(allMetrics: PostMetrics[]): Partial<PostMetrics> {
  if (allMetrics.length === 0) return {}

  const sum = (field: keyof PostMetrics) => {
    const values = allMetrics
      .map((m) => m[field] as number | undefined)
      .filter((v): v is number => v != null)
    if (values.length === 0) return undefined
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  return {
    views: sum('views'),
    likes: sum('likes'),
    comments: sum('comments'),
    shares: sum('shares'),
    watch_time_seconds: sum('watch_time_seconds'),
    engagement_rate: sum('engagement_rate'),
  }
}

// ─── Generate insight ─────────────────────────────────────────────────────────

export async function generateInsight(
  metrics: PostMetrics,
  channelAvg: Partial<PostMetrics>
): Promise<Insight> {
  const post = await getPostById(metrics.post_id)
  if (!post) throw new Error(`[analytics-engine] post not found: ${metrics.post_id}`)

  const channel = await getChannelById(post.channel_id)
  if (!channel) throw new Error(`[analytics-engine] channel not found: ${post.channel_id}`)

  // Idempotency: skip if insight already exists
  const existing = await getInsightByPostId(metrics.post_id)
  if (existing) {
    logger.info(`[analytics-engine] insight already exists for post ${metrics.post_id}`)
    return existing
  }

  const prompt = buildInsightPrompt(metrics, channelAvg)
  const llmResponse = await callLLM(prompt)

  // Requirement 5.2: exactly 3 factors
  const factors: InsightFactor[] = llmResponse.factors.slice(0, 3).map((f) => ({
    label: f.label,
    description: f.description,
    impact: f.impact,
    magnitude: f.magnitude,
  }))

  // Pad to exactly 3 if LLM returned fewer (defensive)
  while (factors.length < 3) {
    factors.push({
      label: 'Insufficient data',
      description: 'Not enough metric data was available to identify an additional factor.',
      impact: 'negative',
      magnitude: 'low',
    })
  }

  const insight = await insertInsight({
    id: crypto.randomUUID(),
    post_id: metrics.post_id,
    creator_id: post.creator_id,
    channel_id: post.channel_id,
    factors,
    recommendation: llmResponse.recommendation,
    generated_at: new Date(),
  })

  logger.info(`[analytics-engine] insight generated for post ${metrics.post_id}`)
  return insight
}
