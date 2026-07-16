'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { analyticsKeys, getDashboard } from '@/lib/api/analytics'
import MetricCard from '@/components/analytics/MetricCard'
import MetricChart from '@/components/analytics/MetricChart'

type Range = '7d' | '30d' | '90d'
const RANGES: Range[] = ['7d', '30d', '90d']

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('30d')
  const { data: session } = useSession()
  const creatorId = session?.creatorId

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: analyticsKeys.dashboard(creatorId ?? '', range),
    queryFn: () => getDashboard(creatorId!, range),
    enabled: !!creatorId,
  })

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                range === r ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-600">Failed to load analytics.</p>
          <button
            onClick={() => refetch()}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))
        ) : (
          <>
            <MetricCard name="Views" value={data?.views} />
            <MetricCard name="Likes" value={data?.likes} />
            <MetricCard name="Comments" value={data?.comments} />
            <MetricCard name="Shares" value={data?.shares} />
            <MetricCard name="Watch Time (s)" value={data?.watch_time_seconds} />
            <MetricCard name="Engagement Rate" value={data?.engagement_rate} />
          </>
        )}
      </div>

      <MetricChart data={[]} metricName="Trend" />
    </div>
  )
}
