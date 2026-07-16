'use client'

import Link from 'next/link'

interface SummaryCard {
  title: string
  description: string
  href: string
  icon: string
}

const CARDS: SummaryCard[] = [
  {
    title: 'Assets',
    description: 'Upload and manage your media files. Track processing status and view platform adaptations.',
    href: '/assets',
    icon: '🖼️',
  },
  {
    title: 'Calendar',
    description: 'View and manage your scheduled posts across all channels. Filter by platform or channel.',
    href: '/calendar',
    icon: '📅',
  },
  {
    title: 'Analytics',
    description: 'Monitor performance metrics and AI-generated insights for your published content.',
    href: '/analytics',
    icon: '📊',
  },
  {
    title: 'Channels',
    description: 'Connect and manage your social media accounts on TikTok, Instagram, YouTube, and more.',
    href: '/channels',
    icon: '🔗',
  },
]

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 animate-pulse">
      <div className="mb-3 h-8 w-8 rounded-lg bg-gray-200" />
      <div className="mb-2 h-5 w-24 rounded bg-gray-200" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-full rounded bg-gray-100" />
        <div className="h-3.5 w-4/5 rounded bg-gray-100" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  // Static summary cards — no async data needed for this view.
  // Individual sections handle their own loading states.
  const isLoading = false

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-8">Welcome to PostPilot. Jump into any section below.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <div className="mb-3 text-2xl">{card.icon}</div>
                <h2 className="mb-1.5 text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {card.title}
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
              </Link>
            ))}
      </div>
    </div>
  )
}
