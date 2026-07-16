'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useNotificationStore } from '@/store/notificationStore'
import { getNotifications, notificationsKeys } from '@/lib/api/notifications'
import type { NotificationMessage } from '@/types'

export function useNotifications() {
  const incrementUnread = useNotificationStore((state) => state.incrementUnread)
  const setTokenExpiredChannel = useNotificationStore((state) => state.setTokenExpiredChannel)

  const handleMessage = useCallback(
    (msg: unknown) => {
      const notification = msg as NotificationMessage
      incrementUnread()
      if (notification?.type === 'token_expired') {
        setTokenExpiredChannel(true)
      }
    },
    [incrementUnread, setTokenExpiredChannel]
  )

  const wsStatus = useWebSocket('/ws/notifications', handleMessage)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: notificationsKeys.all,
    queryFn: getNotifications,
  })

  return { notifications, isLoading, wsStatus }
}
