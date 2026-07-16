'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { assetsKeys, getAdaptations } from '@/lib/api/assets'
import { groupByPlatform } from '@/lib/adaptations'
import { AdaptationCard } from './AdaptationCard'

interface AdaptationViewerProps {
  assetId: string
}

export function AdaptationViewer({ assetId }: AdaptationViewerProps) {
  const { data: adaptations, isLoading, isError, refetch } = useQuery({
    queryKey: assetsKeys.adaptations(assetId),
    queryFn: () => getAdaptations(assetId),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-48 w-full animate-pulse rounded bg-gray-200" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="font-medium">Failed to load adaptations</p>
        <button onClick={() => refetch()} className="mt-2 text-sm underline hover:no-underline">
          Retry
        </button>
      </div>
    )
  }

  if (!adaptations || adaptations.length === 0) {
    return <p className="text-gray-500">No adaptations yet.</p>
  }

  const grouped = groupByPlatform(adaptations)
  const platforms = Array.from(grouped.keys())

  return (
    <Tabs.Root defaultValue={platforms[0]}>
      <Tabs.List className="mb-4 flex gap-2 border-b">
        {platforms.map((platform) => (
          <Tabs.Trigger
            key={platform}
            value={platform}
            className="px-4 py-2 capitalize text-gray-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
          >
            {platform}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {platforms.map((platform) => (
        <Tabs.Content key={platform} value={platform} className="space-y-4">
          {grouped.get(platform)!.map((adaptation) => (
            <AdaptationCard key={adaptation.id} adaptation={adaptation} />
          ))}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}
