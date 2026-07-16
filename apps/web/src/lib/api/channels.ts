import { apiClient } from '@/lib/apiClient'
import type { Channel, Platform } from '@/types'

export const channelsKeys = {
  all: ['channels'] as const,
}

export async function getChannels(): Promise<Channel[]> {
  const res = await apiClient.get<Channel[]>('/channels')
  return res.data
}

export async function deleteChannel(id: string): Promise<void> {
  await apiClient.delete(`/channels/${id}`)
}

export function getAuthConnectUrl(platform: Platform): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/auth/${platform}/connect`
}

export async function handleOAuthCallback(
  platform: Platform,
  params: Record<string, string>
): Promise<Channel> {
  const res = await apiClient.get<Channel>(`/auth/${platform}/callback`, { params })
  return res.data
}
