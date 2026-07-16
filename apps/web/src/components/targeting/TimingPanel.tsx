"use client"

import { useQuery } from '@tanstack/react-query'
import { getTiming, targetingKeys } from '@/lib/api/targeting'

interface TimingPanelProps {
  channelId: string
}

export function TimingPanel({ channelId }: TimingPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: targetingKeys.timing(channelId),
    queryFn: () => getTiming(channelId),
    throwOnError: false,
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading optimal timing…</p>
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Failed to load timing recommendations.
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No timing recommendations available.</p>
  }

  const slots = [...data].sort((a, b) => a.rank - b.rank).slice(0, 3)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-700">Best Times to Post</p>
      <div className="flex flex-col gap-2">
        {slots.map((slot) => (
          <div
            key={slot.scheduled_at}
            className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">#{slot.rank}</span>
              <span className="text-gray-800">
                {new Date(slot.scheduled_at).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              Score: {slot.predicted_engagement_score}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
