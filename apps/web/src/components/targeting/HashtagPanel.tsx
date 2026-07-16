"use client"

import { useQuery } from '@tanstack/react-query'
import { getHashtags, targetingKeys } from '@/lib/api/targeting'
import type { Platform } from '@/types'

interface HashtagPanelProps {
  postId: string
  platform: Platform
  onHashtagSelect: (hashtag: string) => void
}

const volumeBadgeClass: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  mid: 'bg-yellow-100 text-yellow-800',
  niche: 'bg-gray-100 text-gray-700',
}

export function HashtagPanel({ postId, platform, onHashtagSelect }: HashtagPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: targetingKeys.hashtags(postId, platform),
    queryFn: () => getHashtags(postId, platform),
    throwOnError: false,
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading hashtag suggestions…</p>
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Failed to load hashtag suggestions.
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No hashtag suggestions available.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-700">Hashtag Suggestions</p>
      <div className="flex flex-wrap gap-2">
        {data.map((suggestion) => (
          <button
            key={suggestion.hashtag}
            type="button"
            onClick={() => onHashtagSelect(suggestion.hashtag)}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-blue-600">#{suggestion.hashtag}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${volumeBadgeClass[suggestion.volume_tier] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {suggestion.volume_tier}
            </span>
            <span className="text-xs text-gray-500">{suggestion.predicted_reach_score}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
