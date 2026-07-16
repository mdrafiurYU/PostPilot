import { createLogger } from '@postpilot/logger'
const logger = createLogger('notification-service')

// Push notification provider stub (FCM/APNs)
// Replace with real FCM/APNs SDK integration

export interface PushPayload {
  creatorId: string
  title: string
  body: string
  data?: Record<string, string>
}

/**
 * Send a push notification to all devices registered for the given creator.
 * Stub: logs to console. Wire up FCM/APNs in production.
 */
export async function sendPushNotification(payload: PushPayload): Promise<void> {
  logger.info({ payload }, '[pushProvider] push notification')
  // TODO: integrate FCM (firebase-admin) or APNs (@parse/node-apn)
  // Example FCM:
  //   await admin.messaging().sendToTopic(`creator-${payload.creatorId}`, {
  //     notification: { title: payload.title, body: payload.body },
  //     data: payload.data,
  //   })
}
