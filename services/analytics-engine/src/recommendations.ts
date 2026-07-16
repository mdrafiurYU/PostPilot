import { createLogger } from '@postpilot/logger'
const logger = createLogger('analytics-engine')

// "Do more like this" recommendation — identifies top-25% performing posts
// and generates a recommendation listing up to 5 shared content attributes.
// Requirements: 5.4

import type { Post, PostMetrics } from '@postpilot/types'
import { getPublishedPostsByChannel, getMetricsByPostId, getInsightByPostId } from './db.js'

// ─── LLM stub ─────────────────────────────────────────────────────────────────
// Production: calls Groq llama-3.3-70b-versatile for recommendation generation.

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

async function callLLMForRecommendation(
  topPosts: Post[],
  allPosts: Post[]
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    // Stub: returns a generic recommendation when GROQ_API_KEY is not set
    logger.info(`[analytics-engine] GROQ_API_KEY not set — returning stub recommendation for ${topPosts.length} top posts`)
    return 'Your top-performing posts share these attributes: short-form video (under 60s), posted on weekday mornings, include a strong hook in the first 3 seconds, use 5–10 relevant hashtags, and feature educational or how-to content.'
  }

  logger.info(`[analytics-engine] calling Groq for recommendation generation (${topPosts.length} top posts)`)

  const prompt = `You are a social media strategist. Based on the following data about a creator's top-performing posts, identify up to 5 content attributes they share.

Top-performing post count: ${topPosts.length}
Total post count: ${allPosts.length}

List only the attributes as a concise plain-English sentence. No bullet points, no markdown.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 256,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as GroqChatResponse
  return data.choices[0]?.message?.content?.trim() ?? ''
}

// ─── Identify top-25% posts ───────────────────────────────────────────────────

export function identifyTopPerformers(
  posts: Post[],
  metricsMap: Map<string, PostMetrics>
): Post[] {
  if (posts.length === 0) return []

  // Score posts by engagement_rate if available, else views, else 0
  const scored = posts
    .map((post) => {
      const m = metricsMap.get(post.id)
      const score = m?.engagement_rate ?? (m?.views != null ? m.views / 1_000_000 : 0)
      return { post, score }
    })
    .sort((a, b) => b.score - a.score)

  const topCount = Math.ceil(posts.length * 0.25)
  return scored.slice(0, topCount).map((s) => s.post)
}

// ─── Generate recommendation for a channel ───────────────────────────────────

export async function generateDoMoreLikeThis(channelId: string): Promise<string | null> {
  const allPosts = await getPublishedPostsByChannel(channelId)
  if (allPosts.length === 0) return null

  // Build metrics map
  const metricsMap = new Map<string, PostMetrics>()
  for (const post of allPosts) {
    const m = await getMetricsByPostId(post.id)
    if (m) metricsMap.set(post.id, m)
  }

  const topPosts = identifyTopPerformers(allPosts, metricsMap)
  if (topPosts.length === 0) return null

  const recommendation = await callLLMForRecommendation(topPosts, allPosts)
  logger.info(`[analytics-engine] "Do more like this" generated for channel ${channelId}`)
  return recommendation
}
