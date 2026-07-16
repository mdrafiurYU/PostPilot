'use client'

import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { getReconnectDelay } from '@/lib/validation'

type WsStatus = 'connecting' | 'connected' | 'disconnected'

const getWsBaseUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
  return apiUrl.replace(/^http/, 'ws')
}

export function useWebSocket(path: string, onMessage: (msg: unknown) => void): WsStatus {
  const onMessageRef = useRef(onMessage)
  // Keep callback ref current without re-triggering the effect
  onMessageRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let destroyed = false

    function connect() {
      if (destroyed) return

      const url = `${getWsBaseUrl()}${path}`
      useNotificationStore.getState().setWsStatus('connecting')

      ws = new WebSocket(url)

      ws.onopen = () => {
        if (destroyed) {
          ws?.close()
          return
        }
        attempt = 0
        useNotificationStore.getState().setWsStatus('connected')
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed: unknown = JSON.parse(event.data as string)
          onMessageRef.current(parsed)
        } catch {
          // ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        if (destroyed) return
        useNotificationStore.getState().setWsStatus('disconnected')
        attempt += 1
        const delay = getReconnectDelay(attempt)
        reconnectTimeout = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // onclose fires after onerror; reconnect is handled there
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.onclose = null // prevent reconnect scheduling on intentional close
        ws.close()
      }
    }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  return useNotificationStore((state) => state.wsStatus)
}
