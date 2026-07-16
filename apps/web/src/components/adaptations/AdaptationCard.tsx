import type { Adaptation } from '@/types'

// Frontend-enriched Adaptation — the API may return additional fields
// not present in the base @postpilot/types definition.
interface EnrichedAdaptation extends Adaptation {
  media_type?: 'video' | 'image'
  s3_url?: string          // presigned URL resolved by the frontend from s3_key
  failure_reason?: string
}

interface AdaptationCardProps {
  adaptation: EnrichedAdaptation
}

export function AdaptationCard({ adaptation }: AdaptationCardProps) {
  if (adaptation.status === 'pending') {
    return <div className="h-48 w-full animate-pulse rounded bg-gray-200" />
  }

  if (adaptation.status === 'failed') {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="font-medium">Adaptation failed</p>
        {adaptation.failure_reason && (
          <p className="mt-1 text-sm">{adaptation.failure_reason}</p>
        )}
      </div>
    )
  }

  // Fall back to s3_key if a presigned s3_url hasn't been resolved yet
  const mediaSrc = adaptation.s3_url ?? adaptation.s3_key

  return (
    <div className="space-y-2">
      {adaptation.media_type === 'video' ? (
        <video src={mediaSrc} controls className="w-full rounded" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc} alt={adaptation.format_variant} className="w-full rounded" />
      )}
      <div className="space-y-1 text-sm text-gray-600">
        <p><span className="font-medium">Aspect ratio:</span> {adaptation.aspect_ratio}</p>
        <p><span className="font-medium">Codec:</span> {adaptation.codec}</p>
        <p><span className="font-medium">Format:</span> {adaptation.format_variant}</p>
      </div>
    </div>
  )
}
