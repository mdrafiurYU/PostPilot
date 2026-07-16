'use client'

import ChannelList from '@/components/channels/ChannelList'

export default function ChannelsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Channels</h1>
      <ChannelList />
    </div>
  )
}
