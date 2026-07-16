'use client'

import type { Platform, Channel } from '@/types'

interface FilterBarProps {
  platforms: Platform[]
  channels: Channel[]
  selectedPlatform?: Platform
  selectedChannelId?: string
  onPlatformChange: (platform: Platform | undefined) => void
  onChannelChange: (channelId: string | undefined) => void
}

export default function FilterBar({
  platforms,
  channels,
  selectedPlatform,
  selectedChannelId,
  onPlatformChange,
  onChannelChange,
}: FilterBarProps) {
  return (
    <div className="flex gap-3">
      <select
        value={selectedPlatform ?? ''}
        onChange={(e) => onPlatformChange(e.target.value ? (e.target.value as Platform) : undefined)}
        className="border rounded px-3 py-1.5 text-sm"
      >
        <option value="">All Platforms</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={selectedChannelId ?? ''}
        onChange={(e) => onChannelChange(e.target.value || undefined)}
        className="border rounded px-3 py-1.5 text-sm"
      >
        <option value="">All Channels</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.platform_username}
          </option>
        ))}
      </select>
    </div>
  )
}
