const VIDEO_FORMATS = ['mp4', 'mov', 'webm']
const IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'gif']
const VIDEO_MAX_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB
const IMAGE_MAX_BYTES = 500 * 1024 * 1024 // 500 MB

export function validateUploadFile(file: { name: string; size: number; type: string }):
  | { valid: true }
  | { valid: false; error: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const isVideo = VIDEO_FORMATS.includes(ext)
  const isImage = IMAGE_FORMATS.includes(ext)

  if (!isVideo && !isImage) {
    return { valid: false, error: 'Unsupported format. Accepted: MP4, MOV, WebM, JPEG, PNG, GIF.' }
  }
  if (isVideo && file.size > VIDEO_MAX_BYTES) {
    return { valid: false, error: 'File exceeds the 10 GB limit for video files.' }
  }
  if (isImage && file.size > IMAGE_MAX_BYTES) {
    return { valid: false, error: 'File exceeds the 500 MB limit for image files.' }
  }
  return { valid: true }
}

export function validateScheduledAt(date: Date): { valid: true } | { valid: false; error: string } {
  const now = new Date()
  const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  if (date <= now) {
    return { valid: false, error: 'Scheduled time must be in the future.' }
  }
  if (date > maxDate) {
    return { valid: false, error: 'Scheduled time cannot be more than 90 days in the future.' }
  }
  return { valid: true }
}

export function validateBatchSize(n: number): { valid: true } | { valid: false; error: string } {
  if (n < 1) {
    return { valid: false, error: 'Batch must contain at least 1 post.' }
  }
  if (n > 50) {
    return { valid: false, error: 'Batch cannot exceed 50 posts.' }
  }
  return { valid: true }
}

export function appendHashtag(caption: string, hashtag: string): string {
  const tag = hashtag.startsWith('#') ? hashtag : '#' + hashtag
  return `${caption} ${tag}`.trim()
}

export function formatMetric(value: number | null | undefined): string {
  if (value == null) return 'N/A'
  return value.toLocaleString()
}

export function canCancelOrReschedule(status: string): boolean {
  return status === 'draft' || status === 'scheduled'
}

export function canConnectChannel(count: number): boolean {
  return count < 10
}

export function getNotificationLink(notification: {
  resource_type?: string
  resource_id?: string
}): string | null {
  if (!notification.resource_type || !notification.resource_id) return null
  const { resource_type, resource_id } = notification
  if (resource_type === 'asset') return `/assets/${resource_id}`
  if (resource_type === 'post') return `/calendar?post=${resource_id}`
  if (resource_type === 'channel') return '/channels'
  return null
}

export function getReconnectDelay(attempt: number): number {
  return Math.min(Math.pow(2, attempt - 1) * 1000, 30_000)
}

export function getAssetStatusDisplay(status: string): { label: string; isReady: boolean } {
  return { label: status, isReady: status === 'ready' }
}
