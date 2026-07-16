import { createLogger } from '@postpilot/logger'
const logger = createLogger('repurposing-engine')

// GCS upload helpers for the Repurposing Engine

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

/**
 * Upload a string (subtitle content) to GCS and return the GCS key.
 */
export async function uploadStringToS3(content: string, s3Key: string): Promise<string> {
  const bucket = process.env.GCS_BUCKET ?? 'postpilot-assets'
  logger.info(`[gcs] uploading string → gs://${bucket}/${s3Key} (${content.length} bytes)`)
  return s3Key
}
