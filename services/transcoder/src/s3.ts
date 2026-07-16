import { createLogger } from '@postpilot/logger'
const logger = createLogger('transcoder')

// GCS upload helpers for the Transcoder

/**
 * Upload a local file to GCS and return the GCS key.
 * In production this would use the @google-cloud/storage SDK; here it's a stub that logs.
 */
export async function uploadToS3(localPath: string, s3Key: string): Promise<string> {
  const bucket = process.env.GCS_BUCKET ?? 'postpilot-assets'
  logger.info(`[gcs] uploading ${localPath} → gs://${bucket}/${s3Key}`)
  // In production: use @google-cloud/storage to upload
  return s3Key
}
