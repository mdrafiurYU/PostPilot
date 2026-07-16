import { createLogger } from '@postpilot/logger'
const logger = createLogger('notification-service')

// Email notification provider stub (SES/SendGrid)
// Replace with real SES or SendGrid SDK integration

export interface EmailPayload {
  toCreatorId: string
  toAddress: string
  subject: string
  body: string
}

/**
 * Send a transactional email for critical alerts.
 * Stub: logs to console. Wire up SES/SendGrid in production.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  logger.info({ payload }, '[emailProvider] email')
  // TODO: integrate SendGrid (@sendgrid/mail) or Resend (resend) for transactional email
  // Example SES:
  //   await sesClient.send(new SendEmailCommand({
  //     Destination: { ToAddresses: [payload.toAddress] },
  //     Message: {
  //       Subject: { Data: payload.subject },
  //       Body: { Text: { Data: payload.body } },
  //     },
  //     Source: process.env.EMAIL_FROM!,
  //   }))
}

/**
 * Look up a creator's email address.
 * Stub: returns a placeholder. Wire up to auth/user DB in production.
 */
export async function getCreatorEmail(creatorId: string): Promise<string | null> {
  // TODO: query users table or call auth-service
  logger.info(`[emailProvider] getCreatorEmail called for creator ${creatorId}`)
  return process.env.FALLBACK_EMAIL ?? null
}
