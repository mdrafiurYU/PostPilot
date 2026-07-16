"use client"

import { useState, lazy, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAssets, assetsKeys } from '@/lib/api/assets'
import { getChannels, channelsKeys } from '@/lib/api/channels'
import { createPost } from '@/lib/api/posts'
import { validateScheduledAt, appendHashtag } from '@/lib/validation'
import { CaptionEditor } from './CaptionEditor'

const TargetingPanel = lazy(() =>
  import('@/components/targeting/TargetingPanel').then((m) => ({ default: m.TargetingPanel }))
)

interface PostFormValues {
  assetId: string
  channelId: string
  caption: string
  scheduledAt: string
}

const TOTAL_STEPS = 3

export function PostComposer() {
  const [step, setStep] = useState(1)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const queryClient = useQueryClient()

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: assetsKeys.all,
    queryFn: getAssets,
  })

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: channelsKeys.all,
    queryFn: getChannels,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PostFormValues>({
    defaultValues: { assetId: '', channelId: '', caption: '', scheduledAt: '' },
  })

  const captionValue = watch('caption')
  const selectedChannelId = watch('channelId')
  const selectedChannel = channels.find((c) => c.id === selectedChannelId)

  function handleScheduledAtChange(value: string) {
    setValue('scheduledAt', value)
    if (!value) { setScheduleError(null); return }
    const result = validateScheduledAt(new Date(value))
    setScheduleError(result.valid ? null : result.error)
  }

  async function onSubmit(data: PostFormValues) {
    setSubmitError(null)
    try {
      await createPost({
        asset_id: data.assetId || undefined,
        channel_id: data.channelId,
        caption: data.caption,
        scheduled_at: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      setSuccess(true)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to schedule post.')
    }
  }

  if (success) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4 text-green-800 text-sm">
        Post scheduled successfully!
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 max-w-lg">
      <p className="text-sm text-gray-500">Step {step} of {TOTAL_STEPS}</p>

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="assetId" className="text-sm font-medium">Select Asset</label>
          {assetsLoading ? (
            <p className="text-sm text-gray-400">Loading assets…</p>
          ) : (
            <select
              id="assetId"
              className="rounded border border-gray-300 p-2 text-sm"
              {...register('assetId', { required: 'Please select an asset.' })}
            >
              <option value="">— choose an asset —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.filename}</option>
              ))}
            </select>
          )}
          {errors.assetId && <p className="text-xs text-red-500" role="alert">{errors.assetId.message}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="channelId" className="text-sm font-medium">Select Channel</label>
          {channelsLoading ? (
            <p className="text-sm text-gray-400">Loading channels…</p>
          ) : (
            <select
              id="channelId"
              className="rounded border border-gray-300 p-2 text-sm"
              {...register('channelId', { required: 'Please select a channel.' })}
            >
              <option value="">— choose a channel —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.platform_username} ({c.platform})</option>
              ))}
            </select>
          )}
          {errors.channelId && <p className="text-xs text-red-500" role="alert">{errors.channelId.message}</p>}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Caption</label>
            <CaptionEditor
              value={captionValue}
              onChange={(val) => setValue('caption', val)}
              platform={selectedChannel?.platform}
            />
          </div>

          {selectedChannel && watch('assetId') && (
            <Suspense fallback={<p className="text-sm text-gray-400">Loading targeting panel…</p>}>
              <TargetingPanel
                postId={watch('assetId')}
                platform={selectedChannel.platform}
                channelId={selectedChannel.id}
                onHashtagSelect={(hashtag) =>
                  setValue('caption', appendHashtag(captionValue, hashtag))
                }
              />
            </Suspense>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="scheduledAt" className="text-sm font-medium">Schedule Date &amp; Time</label>
            <input
              id="scheduledAt"
              type="datetime-local"
              className="rounded border border-gray-300 p-2 text-sm"
              {...register('scheduledAt', { required: 'Please set a scheduled time.' })}
              onChange={(e) => handleScheduledAtChange(e.target.value)}
            />
            {errors.scheduledAt && <p className="text-xs text-red-500" role="alert">{errors.scheduledAt.message}</p>}
            {scheduleError && <p className="text-xs text-red-500" role="alert">{scheduleError}</p>}
          </div>

          {submitError && <p className="text-xs text-red-500" role="alert">{submitError}</p>}
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && (
          <button type="button" onClick={() => setStep((s) => s - 1)}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            Back
          </button>
        )}
        {step < TOTAL_STEPS && (
          <button type="button" onClick={() => setStep((s) => s + 1)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Next
          </button>
        )}
        {step === TOTAL_STEPS && (
          <button type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Submit
          </button>
        )}
      </div>
    </form>
  )
}
