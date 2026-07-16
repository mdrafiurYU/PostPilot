'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { handleOAuthCallback } from '@/lib/api/channels'
import { queryClient } from '@/lib/queryClient'
import type { Platform } from '@/types'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const platform = params.platform as Platform
    const callbackParams: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      callbackParams[key] = value
    })

    handleOAuthCallback(platform, callbackParams)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['channels'] })
        router.push('/channels')
      })
      .catch(() => {
        setError('Failed to connect channel. Please try again.')
      })
  }, [params.platform, searchParams, router])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 shadow text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/channels')}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Back to Channels
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
        <p className="text-gray-600">Connecting your channel…</p>
      </div>
    </div>
  )
}
