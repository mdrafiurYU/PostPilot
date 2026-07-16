'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAssetPolling } from '@/hooks/useAssetPolling'
import { getAssetStatusDisplay } from '@/lib/validation'
import { AdaptationViewer } from '@/components/adaptations/AdaptationViewer'

function statusBadgeClass(status: string): string {
  if (status === 'ready') return 'bg-green-100 text-green-700'
  if (status === 'failed') return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-700'
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: asset, isLoading, isError } = useAssetPolling(id)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
        <div className="h-6 w-24 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-40 rounded-lg bg-gray-200 animate-pulse" />
      </div>
    )
  }

  if (isError || !asset) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load asset.
        </div>
      </div>
    )
  }

  const { label } = getAssetStatusDisplay(asset.status)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-gray-900 truncate">{asset.filename}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass(asset.status)}`}>
          {label}
        </span>
      </div>

      {asset.status === 'failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
          {asset.failure_reason && (
            <p className="text-sm text-red-700">{asset.failure_reason}</p>
          )}
          <Link
            href="/assets"
            className="inline-block rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition-colors"
          >
            Re-upload
          </Link>
        </div>
      )}

      <AdaptationViewer assetId={id} />
    </div>
  )
}
