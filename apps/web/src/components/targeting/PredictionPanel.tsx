"use client"

import { useQuery } from '@tanstack/react-query'
import { getPrediction, targetingKeys } from '@/lib/api/targeting'
import type { Platform } from '@/types'

interface PredictionPanelProps {
  postId: string
  platform: Platform
}

const confidenceBadgeClass: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-700',
}

export function PredictionPanel({ postId, platform }: PredictionPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: targetingKeys.prediction(postId, platform),
    queryFn: () => getPrediction(postId, platform),
    throwOnError: false,
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading performance prediction…</p>
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Failed to load performance prediction.
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-gray-400">No prediction available.</p>
  }

  const lowPct = (data.estimated_engagement_rate_low * 100).toFixed(1)
  const highPct = (data.estimated_engagement_rate_high * 100).toFixed(1)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-700">Performance Prediction</p>
      <div className="rounded border border-gray-200 bg-white px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Estimated engagement rate:</span>
          <span className="text-sm font-semibold text-gray-900">
            {lowPct}% – {highPct}%
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass[data.confidence] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {data.confidence} confidence
          </span>
        </div>
        {data.data_source === 'platform_benchmarks' && (
          <p className="text-xs text-gray-500 italic">Based on platform-wide data</p>
        )}
      </div>
    </div>
  )
}
