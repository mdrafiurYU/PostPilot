"use client"

import { useState } from 'react'
import type { Platform } from '@/types'
import { appendHashtag } from '@/lib/validation'

const CHAR_LIMITS: Record<string, number> = {
  tiktok: 2200,
  instagram: 2200,
  youtube: 5000,
  linkedin: 3000,
  facebook: 63206,
}

const DEFAULT_LIMIT = 2200

export interface CaptionEditorProps {
  value: string
  onChange: (value: string) => void
  platform?: Platform
  onHashtagAppend?: (hashtag: string) => void
}

export function appendHashtagToCaption(caption: string, hashtag: string): string {
  return appendHashtag(caption, hashtag)
}

export function CaptionEditor({ value, onChange, platform }: CaptionEditorProps) {
  const [blurred, setBlurred] = useState(false)
  const limit = platform ? (CHAR_LIMITS[platform] ?? DEFAULT_LIMIT) : DEFAULT_LIMIT
  const isOverLimit = value.length > limit

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setBlurred(true)}
        placeholder="Write your caption..."
        aria-label="Caption"
      />
      <div className="flex items-center justify-between text-xs">
        <span className={isOverLimit ? 'text-red-500' : 'text-gray-500'}>
          {value.length} / {limit}
        </span>
      </div>
      {blurred && isOverLimit && (
        <p className="text-xs text-red-500" role="alert">
          Caption exceeds the character limit{platform ? ` for ${platform}` : ''}
        </p>
      )}
    </div>
  )
}
