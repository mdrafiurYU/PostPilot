"use client"

import { useQuery } from '@tanstack/react-query'
import { getTrends, targetingKeys } from '@/lib/api/targeting'
import type { Platform } from '@/types'

interface TrendsPanelProps {
  platform: Platform
  category: string
}

export function TrendsPanel({ platform, category }: TrendsPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: targetingKeys.trends(platform, category),
    queryFn: () => getTrends(platform, category),
    throwOnError: false,
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading trends…</p>
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Failed to load trends.
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No trends available.</p>
  }

  const trends = data.slice(0, 10)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-700">Trending Now</p>
      <ol className="flex flex-col gap-1">
        {trends.map((trend) => (
          <li
            key={`${trend.rank}-${trend.title}`}
            className="flex items-center gap-3 rounded border border-gray-100 bg-white px-3 py-2 text-sm"
          >
            <span className="w-5 text-center text-xs font-bold text-gray-400">{trend.rank}</span>
            <span className="flex-1 text-gray-800">{trend.title}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {trend.category}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
