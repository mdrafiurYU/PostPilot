'use client'

import { canConnectChannel } from '@/lib/validation'
import type { Platform } from '@/types'

interface ConnectButtonProps {
  platform: Platform
  channelCount: number
}

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
}

export default function ConnectButton({ platform, channelCount }: ConnectButtonProps) {
  const canConnect = canConnectChannel(channelCount)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
  const label = PLATFORM_LABELS[platform]

  function handleClick() {
    window.location.href = `${apiUrl}/auth/${platform}/connect`
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={canConnect ? handleClick : undefined}
        disabled={!canConnect}
        aria-disabled={!canConnect}
        className={`text-sm px-4 py-2 rounded font-medium transition-colors ${
          canConnect
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
        }`}
      >
        Connect {label}
      </button>
      {!canConnect && (
        <p className="text-xs text-gray-500">
          Per-platform limit of 10 channels reached for {label}.
        </p>
      )}
    </div>
  )
}
