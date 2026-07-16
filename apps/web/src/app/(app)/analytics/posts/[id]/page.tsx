'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { analyticsKeys, getPostMetrics, getPostInsight, getChannelRecommendation } from '@/lib/api/analytics'
import MetricCard from '@/components/analytics/MetricCard'
import InsightCard from '@/components/analytics/InsightCard'
import RecommendationCard from '@/components/analytics/RecommendationCard'

export default function PostAnalyticsPage() {
  const { id } = useParams<{ id: string }>()

  const metricsQuery = useQuery({
    queryKey: analyticsKeys.postMetrics(id),
    queryFn: () => getPostMetrics(id),
    enabled: !!id,
  })

  const insightQuery = useQuery({
    queryKey: analyticsKeys.postInsight(id),
    queryFn: () => getPostInsight(id),
    enabled: !!id,
  })

  const recommendationQuery = useQuery({
    queryKey: analyticsKeys.channelRecommendation(id),
    queryFn: () => getChannelRecommendation(id),
    enabled: !!id,
  })

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Post Analytics</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {metricsQuery.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))
        ) : (
          <>
            <MetricCard name="Views" value={metricsQuery.data?.views} />
            <MetricCard name="Likes" value={metricsQuery.data?.likes} />
            <MetricCard name="Comments" value={metricsQuery.data?.comments} />
            <MetricCard name="Shares" value={metricsQuery.data?.shares} />
            <MetricCard name="Watch Time (s)" value={metricsQuery.data?.watch_time_seconds} />
            <MetricCard name="Engagement Rate" value={metricsQuery.data?.engagement_rate} />
          </>
        )}
      </div>

      {insightQuery.isLoading ? (
        <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
      ) : insightQuery.data ? (
        <InsightCard insight={insightQuery.data} />
      ) : null}

      {recommendationQuery.isLoading ? (
        <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
      ) : recommendationQuery.data ? (
        <RecommendationCard attributes={recommendationQuery.data.attributes} />
      ) : null}
    </div>
  )
}
