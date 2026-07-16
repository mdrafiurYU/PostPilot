'use client'

import Link from 'next/link'
import { useNotificationStore } from '@/store/notificationStore'

export default function ReauthBanner() {
  const hasTokenExpiredChannel = useNotificationStore((s) => s.hasTokenExpiredChannel)

  if (!hasTokenExpiredChannel) return null

  return (
    <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-center gap-2 text-amber-900 text-sm">
      <span>One or more channels require re-authentication.</span>
      <Link href="/channels" className="font-medium underline hover:text-amber-700">
        Go to Channels
      </Link>
    </div>
  )
}
