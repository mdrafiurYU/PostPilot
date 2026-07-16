import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import type { PostStatus } from '@/types'

export function useBatchStatus(batchId: string): Map<string, PostStatus> {
  const [statusMap, setStatusMap] = useState<Map<string, PostStatus>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const { data: session } = useSession()
  const token = session?.accessToken

  useEffect(() => {
    // Only connect once batchId changes; token changes don't reconnect
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    const wsUrl =
      baseUrl.replace(/^http/, 'ws') + `/ws/batches/${batchId}${token ? `?token=${token}` : ''}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { post_id: string; status: PostStatus }
        setStatusMap((prev) => {
          const next = new Map(prev)
          next.set(msg.post_id, msg.status)
          return next
        })
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      ws.close()
    }
  }, [batchId])

  return statusMap
}
