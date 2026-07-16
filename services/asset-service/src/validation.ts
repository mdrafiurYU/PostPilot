// Validation logic for asset upload requests

export type ValidationError = {
  field: string
  message: string
}

export const ALLOWED_VIDEO_FORMATS = new Set(['mp4', 'mov', 'webm'] as const)
export const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'gif'] as const)

export const MAX_VIDEO_SIZE_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB
export const MAX_IMAGE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB

type VideoFormat = 'mp4' | 'mov' | 'webm'
type ImageFormat = 'jpeg' | 'png' | 'gif'
type AssetFormat = VideoFormat | ImageFormat

type ValidResult =
  | { valid: true; mediaType: 'video'; format: VideoFormat }
  | { valid: true; mediaType: 'image'; format: ImageFormat }

type InvalidResult = { valid: false; errors: ValidationError[] }

export type ValidationResult = ValidResult | InvalidResult

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export function validateUpload(filename: string, fileSizeBytes: number): ValidationResult {
  const errors: ValidationError[] = []
  const ext = getExtension(filename)

  const isVideo = ALLOWED_VIDEO_FORMATS.has(ext as VideoFormat)
  const isImage = ALLOWED_IMAGE_FORMATS.has(ext as ImageFormat)

  if (!isVideo && !isImage) {
    errors.push({
      field: 'filename',
      message: `Unsupported format "${ext}". Allowed video formats: mp4, mov, webm. Allowed image formats: jpeg, png, gif.`,
    })
    return { valid: false, errors }
  }

  if (isVideo && fileSizeBytes > MAX_VIDEO_SIZE_BYTES) {
    errors.push({
      field: 'file_size_bytes',
      message: `Video file size ${fileSizeBytes} bytes exceeds maximum of ${MAX_VIDEO_SIZE_BYTES} bytes (10 GB).`,
    })
  }

  if (isImage && fileSizeBytes > MAX_IMAGE_SIZE_BYTES) {
    errors.push({
      field: 'file_size_bytes',
      message: `Image file size ${fileSizeBytes} bytes exceeds maximum of ${MAX_IMAGE_SIZE_BYTES} bytes (500 MB).`,
    })
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  if (isVideo) {
    return { valid: true, mediaType: 'video', format: ext as VideoFormat }
  }

  return { valid: true, mediaType: 'image', format: ext as ImageFormat }
}
