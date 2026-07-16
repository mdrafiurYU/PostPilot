/**
 * Integration test: WebSocket notification flow
 * connect → receive message → badge increments → item appears
 * Requirements: 7.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Bell: () => React.createElement('span', { 'data-testid': 'bell-icon' }, '🔔'),
  WifiOff: () => React.createElement('span', { 'data-testid': 'wifi-off-icon' }, '📶'),
}))

// Mock notifications API
vi.mock('@/lib/api/notifications', () => ({
  notificationsKeys: { all: ['notifications'] },
  getNotifications: vi.fn(),
  markRead: vi.fn(),
}))

// Mock apiClient
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import { getNotifications } from '@/lib/api/notifications'
import { useNotificationStore } from '@/store/notificationStore'
import { useNotifications } from '@/hooks/useNotifications'
import type { NotificationMessage } from '@/types'

// WebSocket mock
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState = WebSocket.CONNECTING

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    // Auto-connect on next tick
    setTimeout(() => {
      this.readyState = WebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED
    // Don't trigger onclose to avoid reconnect scheduling in tests
  })

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

// Minimal component that uses useNotifications to show badge + list
function NotificationTestHarness() {
  const { notifications, wsStatus } = useNotifications()
  const unreadCount = useNotificationStore((s) => s.unreadCount)

  return (
    <div>
      <span data-testid="unread-count">{unreadCount}</span>
      <span data-testid="ws-status">{wsStatus}</span>
      <ul>
        {notifications.map((n: NotificationMessage) => (
          <li key={n.id} data-testid={`notification-${n.id}`}>{n.message}</li>
        ))}
      </ul>
    </div>
  )
}

describe('WebSocket notification flow integration', () => {
  let originalWebSocket: typeof WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    originalWebSocket = global.WebSocket
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
    vi.clearAllMocks()
    // Reset notification store
    useNotificationStore.setState({
      unreadCount: 0,
      wsStatus: 'disconnected',
      hasTokenExpiredChannel: false,
    })
  })

  afterEach(() => {
    global.WebSocket = originalWebSocket
  })

  it('increments unread badge when a WebSocket message is received', async () => {
    vi.mocked(getNotifications).mockResolvedValue([])

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <NotificationTestHarness />
      </QueryClientProvider>
    )

    // Wait for WS to connect
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Badge starts at 0
    expect(screen.getByTestId('unread-count')).toHaveTextContent('0')

    // Simulate incoming notification
    const notification: NotificationMessage = {
      id: 'notif-1',
      type: 'asset_ready',
      message: 'Your asset is ready!',
      resource_type: 'asset',
      resource_id: 'asset-123',
      created_at: new Date().toISOString(),
      read: false,
    }

    act(() => {
      MockWebSocket.instances[0].simulateMessage(notification)
    })

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1')
    })
  })

  it('increments badge by 1 for each message received', async () => {
    vi.mocked(getNotifications).mockResolvedValue([])

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <NotificationTestHarness />
      </QueryClientProvider>
    )

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    const makeNotif = (id: string): NotificationMessage => ({
      id,
      type: 'post_published',
      message: `Post ${id} published`,
      created_at: new Date().toISOString(),
      read: false,
    })

    act(() => {
      MockWebSocket.instances[0].simulateMessage(makeNotif('n1'))
      MockWebSocket.instances[0].simulateMessage(makeNotif('n2'))
      MockWebSocket.instances[0].simulateMessage(makeNotif('n3'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('3')
    })
  })

  it('sets hasTokenExpiredChannel when token_expired notification is received', async () => {
    vi.mocked(getNotifications).mockResolvedValue([])

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <NotificationTestHarness />
      </QueryClientProvider>
    )

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    expect(useNotificationStore.getState().hasTokenExpiredChannel).toBe(false)

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        id: 'notif-expired',
        type: 'token_expired',
        message: 'Channel token expired',
        resource_type: 'channel',
        resource_id: 'channel-1',
        created_at: new Date().toISOString(),
        read: false,
      })
    })

    await waitFor(() => {
      expect(useNotificationStore.getState().hasTokenExpiredChannel).toBe(true)
    })
  })

  it('connects to /ws/notifications endpoint', async () => {
    vi.mocked(getNotifications).mockResolvedValue([])

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <NotificationTestHarness />
      </QueryClientProvider>
    )

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))

    expect(MockWebSocket.instances[0].url).toContain('/ws/notifications')
  })

  it('shows historical notifications fetched from GET /notifications', async () => {
    const historicalNotifications: NotificationMessage[] = [
      {
        id: 'hist-1',
        type: 'asset_ready',
        message: 'Asset processed successfully',
        created_at: new Date().toISOString(),
        read: true,
      },
      {
        id: 'hist-2',
        type: 'post_published',
        message: 'Post published to Instagram',
        created_at: new Date().toISOString(),
        read: true,
      },
    ]

    vi.mocked(getNotifications).mockResolvedValue(historicalNotifications)

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <NotificationTestHarness />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-hist-1')).toBeInTheDocument()
      expect(screen.getByTestId('notification-hist-2')).toBeInTheDocument()
    })
  })
})
