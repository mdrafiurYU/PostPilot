'use client'

import { useState } from 'react'
import type { Post } from '@/types'
import { canCancelOrReschedule } from '@/lib/posts'

// Frontend-enriched Post — the API returns channel and caption joined in
interface EnrichedPost extends Omit<Post, 'scheduled_at'> {
  scheduled_at: string | Date
  caption?: string
}

interface CalendarGridProps {
  posts: EnrichedPost[]
  isLoading: boolean
  onCancelPost: (postId: string) => void
  onReschedulePost: (postId: string, newDate: string) => void
}

function groupByDate(posts: EnrichedPost[]): Record<string, EnrichedPost[]> {
  return posts.reduce<Record<string, EnrichedPost[]>>((acc, post) => {
    const raw = post.scheduled_at
    const date = typeof raw === 'string' ? raw.slice(0, 10) : raw.toISOString().slice(0, 10)
    if (!acc[date]) acc[date] = []
    acc[date].push(post)
    return acc
  }, {})
}

function PostCard({
  post,
  onCancelPost,
  onReschedulePost,
}: {
  post: EnrichedPost
  onCancelPost: (id: string) => void
  onReschedulePost: (id: string, newDate: string) => void
}) {
  const [rescheduleDate, setRescheduleDate] = useState('')
  const actionable = canCancelOrReschedule(post.status)

  return (
    <div className="border rounded p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {post.channel?.platform_username ?? post.channel_id}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{post.status}</span>
      </div>
      <p className="text-sm text-gray-700">
        {(post.caption ?? '').length > 80
          ? (post.caption ?? '').slice(0, 80) + '…'
          : (post.caption ?? '')}
      </p>
      {actionable && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => onCancelPost(post.id)}
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
          >
            Cancel
          </button>
          <input
            type="datetime-local"
            value={rescheduleDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className="text-xs border rounded px-2 py-1"
          />
          <button
            onClick={() => rescheduleDate && onReschedulePost(post.id, rescheduleDate)}
            disabled={!rescheduleDate}
            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40"
          >
            Reschedule
          </button>
        </div>
      )}
    </div>
  )
}

export default function CalendarGrid({
  posts,
  isLoading,
  onCancelPost,
  onReschedulePost,
}: CalendarGridProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  const grouped = groupByDate(posts)
  const dates = Object.keys(grouped).sort()

  if (dates.length === 0) {
    return <p className="text-sm text-gray-500">No posts scheduled.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {dates.map((date) => (
        <section key={date}>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">{date}</h2>
          <div className="flex flex-col gap-2">
            {grouped[date].map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onCancelPost={onCancelPost}
                onReschedulePost={onReschedulePost}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
