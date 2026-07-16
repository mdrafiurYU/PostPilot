/**
 * Integration test: Batch publish flow
 * create batch → WS messages → per-post status updates in UI
 * Requirements: 3.8
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock batches API
vi.mock('@/lib/api/batches', () => ({
  batchesKeys: { detail: (id: string) => ['batches', id] },
  createBatch: vi.fn(),
  getBatch: vi.fn(),
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

// Mock next-auth/react: useSession returns a fixed token
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: {
      accessToken: 'test-jwt-token',
      user: { id: 'creator-1', email: 'test@example.com', name: 'Test' },
      expires: new Date().toISOString(),
    },
    status: 'authenticated',
  })),
}))

import { createBatch } from '@/lib/api/batches'
import { BatchComposer } from '@/components/composer/BatchComposer'

// WebSocket mock
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState: number = WebSocket.CONNECTING

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = WebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED
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

describe('Batch publish flow integration', () => {
  let originalWebSocket: typeof WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    originalWebSocket = global.WebSocket
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.WebSocket = originalWebSocket
  })

  it('creates batch and shows success state after submission', async () => {
    vi.mocked(createBatch).mockResolvedValue({
      id: 'batch-abc',
      posts: [
        {
          id: 'post-1',
          creator_id: 'creator-1',
          channel_id: 'ch-1',
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
          status: 'draft',
          created_at: new Date().toISOString(),
        },
      ],
    })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    // Fill in the first post
    const assetInputs = screen.getAllByPlaceholderText('Asset ID')
    const channelInputs = screen.getAllByPlaceholderText('Channel ID')
    await userEvent.type(assetInputs[0], 'asset-1')
    await userEvent.type(channelInputs[0], 'ch-1')

    // Submit the batch
    await userEvent.click(screen.getByRole('button', { name: /create batch/i }))

    await waitFor(() => {
      expect(createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          posts: expect.arrayContaining([
            expect.objectContaining({ asset_id: 'asset-1', channel_id: 'ch-1' }),
          ]),
        }),
      )
    })

    // Success message should appear
    await waitFor(() => {
      expect(screen.getByText(/batch created successfully/i)).toBeInTheDocument()
    })
  })

  it('connects to /ws/batches/:id after batch creation', async () => {
    vi.mocked(createBatch).mockResolvedValue({
      id: 'batch-xyz',
      posts: [],
    })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create batch/i }))

    await waitFor(() => {
      expect(screen.getByText(/batch created successfully/i)).toBeInTheDocument()
    })

    // A WebSocket should have been opened for the batch
    await waitFor(() => {
      const batchWs = MockWebSocket.instances.find((ws) => ws.url.includes('/ws/batches/batch-xyz'))
      expect(batchWs).toBeDefined()
    })
  })

  it('displays per-post status updates received via WebSocket', async () => {
    vi.mocked(createBatch).mockResolvedValue({
      id: 'batch-status-test',
      posts: [],
    })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create batch/i }))

    await waitFor(() => {
      expect(screen.getByText(/batch created successfully/i)).toBeInTheDocument()
    })

    // Wait for WS to be created
    await waitFor(() => {
      expect(MockWebSocket.instances.some((ws) => ws.url.includes('/ws/batches/'))).toBe(true)
    })

    const batchWs = MockWebSocket.instances.find((ws) => ws.url.includes('/ws/batches/'))!

    // Simulate per-post status messages
    act(() => {
      batchWs.simulateMessage({ post_id: 'post-001', status: 'publishing' })
    })

    await waitFor(() => {
      expect(screen.getByText('publishing')).toBeInTheDocument()
    })

    act(() => {
      batchWs.simulateMessage({ post_id: 'post-001', status: 'published' })
    })

    await waitFor(() => {
      expect(screen.getByText('published')).toBeInTheDocument()
    })
  })

  it('shows multiple post statuses simultaneously', async () => {
    vi.mocked(createBatch).mockResolvedValue({
      id: 'batch-multi',
      posts: [],
    })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create batch/i }))

    await waitFor(() => {
      expect(screen.getByText(/batch created successfully/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(MockWebSocket.instances.some((ws) => ws.url.includes('/ws/batches/'))).toBe(true)
    })

    const batchWs = MockWebSocket.instances.find((ws) => ws.url.includes('/ws/batches/'))!

    act(() => {
      batchWs.simulateMessage({ post_id: 'post-A', status: 'published' })
      batchWs.simulateMessage({ post_id: 'post-B', status: 'failed' })
    })

    await waitFor(() => {
      expect(screen.getByText('published')).toBeInTheDocument()
      expect(screen.getByText('failed')).toBeInTheDocument()
    })
  })

  it('shows inline error when adding more than 50 posts', async () => {
    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    const addButton = screen.getByRole('button', { name: /add post/i })

    // Add posts up to 50 (starts with 1, need 49 more clicks)
    for (let i = 0; i < 49; i++) {
      await userEvent.click(addButton)
    }

    // 51st attempt (clicking when already at 50)
    await userEvent.click(addButton)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('includes JWT token in WebSocket URL', async () => {
    vi.mocked(createBatch).mockResolvedValue({
      id: 'batch-token-test',
      posts: [],
    })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <BatchComposer />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create batch/i }))

    await waitFor(() => {
      const batchWs = MockWebSocket.instances.find((ws) =>
        ws.url.includes('/ws/batches/batch-token-test'),
      )
      expect(batchWs?.url).toContain('token=test-jwt-token')
    })
  })
})
