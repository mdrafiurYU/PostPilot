"use client"

import type { Platform } from '@/types'
import { HashtagPanel } from './HashtagPanel'
import { TimingPanel } from './TimingPanel'
import { TrendsPanel } from './TrendsPanel'
import { PredictionPanel } from './PredictionPanel'

interface TargetingPanelProps {
  postId: string
  platform: Platform
  channelId: string
  onHashtagSelect: (hashtag: string) => void
}

export function TargetingPanel({ postId, platform, channelId, onHashtagSelect }: TargetingPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <HashtagPanel postId={postId} platform={platform} onHashtagSelect={onHashtagSelect} />
      <TimingPanel channelId={channelId} />
      <TrendsPanel platform={platform} category="general" />
      <PredictionPanel postId={postId} platform={platform} />
    </div>
  )
}
