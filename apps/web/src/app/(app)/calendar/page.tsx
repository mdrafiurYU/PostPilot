'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPosts, postsKeys, updatePost } from '@/lib/api/posts'
import { filterPosts } from '@/lib/posts'
import FilterBar from '@/components/calendar/FilterBar'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import type { Platform, Channel } from '@/types'

export default function CalendarPage() {
  const queryClient = useQueryClient()
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | undefined>()
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>()

  const { data: posts, isLoading, isError, refetch } = useQuery({
    queryKey: postsKeys.all,
    queryFn: getPosts,
  })

  const filteredPosts = filterPosts(posts ?? [], selectedPlatform, selectedChannelId)

  const platforms = Array.from(
    new Set((posts ?? []).map((p) => p.channel?.platform).filter(Boolean) as Platform[])
  )

  const channelMap = new Map<string, Channel>()
  for (const post of posts ?? []) {
    if (post.channel && !channelMap.has(post.channel.id)) {
      channelMap.set(post.channel.id, post.channel)
    }
  }
  const channels = Array.from(channelMap.values())

  async function handleCancelPost(id: string) {
    await updatePost(id, { status: 'cancelled' })
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  }

  async function handleReschedulePost(id: string, newDate: string) {
    await updatePost(id, { scheduled_at: new Date(newDate) })
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  }

  if (isError) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600 mb-2">Failed to load posts.</p>
        <button
          onClick={() => refetch()}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <FilterBar
        platforms={platforms}
        channels={channels}
        selectedPlatform={selectedPlatform}
        selectedChannelId={selectedChannelId}
        onPlatformChange={setSelectedPlatform}
        onChannelChange={setSelectedChannelId}
      />
      <CalendarGrid
        posts={filteredPosts}
        isLoading={isLoading}
        onCancelPost={handleCancelPost}
        onReschedulePost={handleReschedulePost}
      />
    </div>
  )
}
