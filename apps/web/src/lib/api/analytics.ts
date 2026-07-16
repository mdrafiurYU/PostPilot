import { apiClient } from '@/lib/apiClient'
import type { DashboardMetrics, Insight } from '@/types'

export const analyticsKeys = {
  dashboard: (creatorId: string, range: '7d' | '30d' | '90d') =>
    ['analytics', 'dashboard', creatorId, range] as const,
  postMetrics: (id: string) => ['analytics', 'posts', id, 'metrics'] as const,
  postInsight: (id: string) => ['analytics', 'posts', id, 'insight'] as const,
  channelRecommendation: (id: string) =>
    ['analytics', 'channels', id, 'recommendation'] as const,
}

export async function getDashboard(
  creatorId: string,
  range: '7d' | '30d' | '90d'
): Promise<DashboardMetrics> {
  const res = await apiClient.get<DashboardMetrics>('/analytics/dashboard', {
    params: { creator_id: creatorId, range },
  })
  return res.data
}

export async function getPostMetrics(postId: string): Promise<DashboardMetrics> {
  const res = await apiClient.get<DashboardMetrics>(`/analytics/posts/${postId}/metrics`)
  return res.data
}

export async function getPostInsight(postId: string): Promise<Insight> {
  const res = await apiClient.get<Insight>(`/analytics/posts/${postId}/insight`)
  return res.data
}

export async function getChannelRecommendation(
  channelId: string
): Promise<{ attributes: string[] }> {
  const res = await apiClient.get<{ attributes: string[] }>(
    `/analytics/channels/${channelId}/recommendation`
  )
  return res.data
}
