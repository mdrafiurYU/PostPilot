'use client'

import Link from 'next/link'
import { getNotificationLink } from '@/lib/validation'
import type { NotificationMessage } from '@/types'

function formatType(type: NotificationMessage['type']): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function NotificationItem({ notification }: { notification: NotificationMessage }) {
  const link = getNotificationLink(notification)
  const formattedDate = new Date(notification.created_at).toLocaleString()

  const content = (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {formatType(notification.type)}
        </span>
        <span className="text-xs text-gray-400 whitespace-nowrap">{formattedDate}</span>
      </div>
      <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
    </div>
  )

  if (link) {
    return (
      <Link href={link} className="block">
        {content}
      </Link>
    )
  }

  return content
}
