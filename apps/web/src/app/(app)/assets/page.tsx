'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { getAssets, assetsKeys } from '@/lib/api/assets'
import { getAssetStatusDisplay } from '@/lib/validation'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import type { Asset } from '@/types'

function AssetListItem({ asset }: { asset: Asset }) {
  const { label } = getAssetStatusDisplay(asset.status)
  const date = new Date(asset.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Link
      href={`/assets/${asset.id}`}
      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <span className="font-medium text-gray-900 truncate">{asset.filename}</span>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {asset.media_type}
        </span>
        <span className="text-xs text-gray-400">{date}</span>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
          {label}
        </span>
      </div>
    </Link>
  )
}

export default function AssetsPage() {
  const queryClient = useQueryClient()
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  const { data: assets, isLoading, isError, refetch } = useQuery({
    queryKey: assetsKeys.all,
    queryFn: getAssets,
  })

  function handleUploadComplete() {
    setUploadProgress(null)
    queryClient.invalidateQueries({ queryKey: assetsKeys.all })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Assets</h1>

      <div className="mb-6">
        <UploadDropzone
          onUploadComplete={handleUploadComplete}
          onProgress={setUploadProgress}
        />
        {uploadProgress !== null && (
          <div className="mt-3">
            <UploadProgress progress={uploadProgress} />
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Failed to load assets.</span>
          <button onClick={() => refetch()} className="underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {assets && (
        <div className="space-y-2">
          {assets.length === 0 && (
            <p className="text-sm text-gray-500">No assets yet. Upload one above.</p>
          )}
          {assets.map((asset) => (
            <AssetListItem key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </div>
  )
}
