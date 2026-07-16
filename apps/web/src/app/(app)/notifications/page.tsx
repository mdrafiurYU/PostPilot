'use client'

import { useQuery } from '@tanstack/react-query'
import { getNotifications, notificationsKeys } from '@/lib/api/notifications'
import NotificationItem from '@/components/notifications/NotificationItem'

function NotificationSkeleton() {
  return (
    <div className="animate-pulse border-b border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
      <div className="mt-2 h-4 w-3/4 rounded bg-gray-200" />
    </div>
  )
}

export default function NotificationsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: notificationsKeys.all,
    queryFn: getNotifications,
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Notifications</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {isLoading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-gray-500">Failed to load notifications.</p>
            <button
              onClick={() => refetch()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && data?.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-500">No notifications yet.</p>
          </div>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <ul>
            {data.map((notification) => (
              <li key={notification.id}>
                <NotificationItem notification={notification} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
