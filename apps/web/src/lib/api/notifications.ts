import { apiClient } from '@/lib/apiClient'
import type { NotificationMessage } from '@/types'

export const notificationsKeys = {
  all: ['notifications'] as const,
}

export async function getNotifications(): Promise<NotificationMessage[]> {
  const res = await apiClient.get<NotificationMessage[]>('/notifications')
  return res.data
}

export async function markRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`)
}
