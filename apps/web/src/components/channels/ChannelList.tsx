'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChannels, deleteChannel, channelsKeys } from '@/lib/api/channels'
import ChannelCard from './ChannelCard'
import ConnectButton from './ConnectButton'
import type { Platform } from '@/types'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook']

function ChannelListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-200" />
            </div>
            <div className="h-5 w-20 rounded-full bg-gray-200" />
          </div>
          <div className="mt-3 h-3 w-40 rounded bg-gray-200" />
          <div className="mt-3 h-8 w-24 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

export default function ChannelList() {
  const queryClient = useQueryClient()

  const { data: channels, isLoading, isError, refetch } = useQuery({
    queryKey: channelsKeys.all,
    queryFn: getChannels,
  })

  const disconnectMutation = useMutation({
    mutationFn: (channelId: string) => deleteChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelsKeys.all })
    },
  })

  function handleDisconnect(channelId: string) {
    disconnectMutation.mutate(channelId)
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <ChannelListSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">Failed to load channels. Please try again.</p>
        <button
          onClick={() => refetch()}
          className="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-900"
        >
          Retry
        </button>
      </div>
    )
  }

  const channelList = channels ?? []

  // Count channels per platform for ConnectButton limit enforcement
  const countByPlatform = PLATFORMS.reduce<Record<Platform, number>>(
    (acc, p) => {
      acc[p] = channelList.filter((c) => c.platform === p).length
      return acc
    },
    {} as Record<Platform, number>
  )

  return (
    <div className="space-y-8">
      {/* Connected channels */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Connected Channels</h2>
        {channelList.length === 0 ? (
          <p className="text-sm text-gray-500">No channels connected yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channelList.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </section>

      {/* Connect new channels */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Connect a Channel</h2>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((platform) => (
            <ConnectButton
              key={platform}
              platform={platform}
              channelCount={countByPlatform[platform]}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
