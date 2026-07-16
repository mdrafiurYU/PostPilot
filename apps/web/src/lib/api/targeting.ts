import { apiClient } from '@/lib/apiClient'
import type { Platform, HashtagSuggestion, TimingSlot, TrendItem, PerformancePrediction } from '@/types'

export const targetingKeys = {
  hashtags: (postId: string, platform: Platform) =>
    ['targeting', 'hashtags', postId, platform] as const,
  timing: (channelId: string) => ['targeting', 'timing', channelId] as const,
  trends: (platform: Platform, category: string) =>
    ['targeting', 'trends', platform, category] as const,
  prediction: (postId: string, platform: Platform) =>
    ['targeting', 'prediction', postId, platform] as const,
}

export async function getHashtags(
  postId: string,
  platform: Platform
): Promise<HashtagSuggestion[]> {
  const res = await apiClient.get<HashtagSuggestion[]>('/targeting/hashtags', {
    params: { post_id: postId, platform },
  })
  return res.data
}

export async function getTiming(channelId: string): Promise<TimingSlot[]> {
  const res = await apiClient.get<TimingSlot[]>('/targeting/timing', {
    params: { channel_id: channelId },
  })
  return res.data
}

export async function getTrends(platform: Platform, category: string): Promise<TrendItem[]> {
  const res = await apiClient.get<TrendItem[]>('/targeting/trends', {
    params: { platform, category },
  })
  return res.data
}

export async function getPrediction(
  postId: string,
  platform: Platform
): Promise<PerformancePrediction> {
  const res = await apiClient.get<PerformancePrediction>('/targeting/prediction', {
    params: { post_id: postId, platform },
  })
  return res.data
}
