"use client"

import { useState } from 'react'
import { createBatch } from '@/lib/api/batches'
import { useBatchStatus } from '@/hooks/useBatchStatus'
import { validateBatchSize } from '@/lib/validation'

interface PostEntry {
  assetId: string
  channelId: string
  caption: string
  scheduledAt: string
}

function emptyPost(): PostEntry {
  return { assetId: '', channelId: '', caption: '', scheduledAt: '' }
}

function BatchStatusView({ batchId }: { batchId: string }) {
  const statusMap = useBatchStatus(batchId)
  return (
    <div className="mt-4 flex flex-col gap-1">
      {statusMap.size === 0 && (
        <p className="text-sm text-gray-500">Waiting for status updates…</p>
      )}
      {Array.from(statusMap.entries()).map(([postId, status]) => (
        <div key={postId} className="flex gap-2 text-sm">
          <span className="font-mono text-gray-500">{postId}</span>
          <span className="font-medium">{status}</span>
        </div>
      ))}
    </div>
  )
}

export function BatchComposer() {
  const [posts, setPosts] = useState<PostEntry[]>([emptyPost()])
  const [batchId, setBatchId] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleAddPost() {
    const validation = validateBatchSize(posts.length + 1)
    if (!validation.valid) { setBatchError(validation.error); return }
    setBatchError(null)
    setPosts((prev) => [...prev, emptyPost()])
  }

  function handleRemovePost(index: number) {
    setBatchError(null)
    setPosts((prev) => prev.filter((_, i) => i !== index))
  }

  function handleChange(index: number, field: keyof PostEntry, value: string) {
    setPosts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const validation = validateBatchSize(posts.length)
    if (!validation.valid) { setSubmitError(validation.error); return }
    try {
      const result = await createBatch({
        posts: posts.map((p) => ({
          asset_id: p.assetId,
          channel_id: p.channelId,
          caption: p.caption,
          scheduled_at: new Date(p.scheduledAt),
        })),
      })
      setBatchId(result.id)
      setSuccess(true)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create batch.')
    }
  }

  if (success && batchId) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="rounded border border-green-300 bg-green-50 p-4 text-green-800 text-sm">
          Batch created successfully! Tracking status…
        </div>
        <BatchStatusView batchId={batchId} />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Batch Composer</h2>
        <button type="button" onClick={handleAddPost}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Add Post
        </button>
      </div>

      {batchError && <p className="text-sm text-red-500" role="alert">{batchError}</p>}

      <div className="flex flex-col gap-4">
        {posts.map((post, index) => (
          <div key={index} className="rounded border border-gray-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Post {index + 1}</span>
              <button type="button" onClick={() => handleRemovePost(index)}
                className="text-sm text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
            <input type="text" value={post.assetId}
              onChange={(e) => handleChange(index, 'assetId', e.target.value)}
              className="rounded border border-gray-300 p-2 text-sm" placeholder="Asset ID" />
            <input type="text" value={post.channelId}
              onChange={(e) => handleChange(index, 'channelId', e.target.value)}
              className="rounded border border-gray-300 p-2 text-sm" placeholder="Channel ID" />
            <textarea value={post.caption}
              onChange={(e) => handleChange(index, 'caption', e.target.value)}
              className="rounded border border-gray-300 p-2 text-sm" rows={2} placeholder="Caption…" />
            <input type="datetime-local" value={post.scheduledAt}
              onChange={(e) => handleChange(index, 'scheduledAt', e.target.value)}
              className="rounded border border-gray-300 p-2 text-sm" />
          </div>
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500" role="alert">{submitError}</p>}

      <button type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 self-start">
        Create Batch
      </button>
    </form>
  )
}
