// Google Cloud Storage client and signed URL helpers
// Uses Application Default Credentials (ADC) — automatic on Cloud Run.

import { Storage } from '@google-cloud/storage'

export const GCS_BUCKET = process.env.GCS_BUCKET ?? 'postpilot-assets'

const storage = new Storage()
const bucket = storage.bucket(GCS_BUCKET)

export async function generatePresignedUploadUrl(
  gcsKey: string,
  contentType: string,
  ttlSeconds = 3600
): Promise<string> {
  const file = bucket.file(gcsKey)
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + ttlSeconds * 1000,
    contentType,
  })
  return url
}

export async function deleteGcsObject(gcsKey: string): Promise<void> {
  const file = bucket.file(gcsKey)
  await file.delete({ ignoreNotFound: true })
}
