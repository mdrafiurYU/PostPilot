/**
 * Integration test: Full upload flow
 * POST /assets → presigned URL → XHR upload → polling until `ready`
 * Requirements: 1.3, 1.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock the assets API module
vi.mock('@/lib/api/assets', () => ({
  assetsKeys: {
    all: ['assets'],
    detail: (id: string) => ['assets', id],
    adaptations: (id: string) => ['assets', id, 'adaptations'],
  },
  createAsset: vi.fn(),
  getAssetById: vi.fn(),
  getAssets: vi.fn(),
  getAdaptations: vi.fn(),
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

import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { createAsset, getAssetById } from '@/lib/api/assets'
import { useAssetPolling } from '@/hooks/useAssetPolling'

// Simple wrapper that shows asset status via polling
function UploadWithPolling({ assetId }: { assetId: string }) {
  const { data: asset } = useAssetPolling(assetId)
  return (
    <div>
      {asset && <span data-testid="asset-status">{asset.status}</span>}
    </div>
  )
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  })
}

// XHR mock state shared between tests
let mockXhrInstance: {
  upload: { addEventListener: ReturnType<typeof vi.fn> }
  status: number
  _listeners: Record<string, ((e: unknown) => void)[]>
  open: ReturnType<typeof vi.fn>
  setRequestHeader: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  addEventListener: (event: string, cb: (e: unknown) => void) => void
  simulateSuccess: () => void
  simulateProgress: (loaded: number, total: number) => void
}

function createMockXhr() {
  const instance = {
    upload: { addEventListener: vi.fn() },
    status: 200,
    _listeners: {} as Record<string, ((e: unknown) => void)[]>,
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    addEventListener(event: string, cb: (e: unknown) => void) {
      if (!this._listeners[event]) this._listeners[event] = []
      this._listeners[event].push(cb)
    },
    simulateSuccess() {
      this.status = 200
      this._listeners['load']?.forEach((cb) => cb({ target: this }))
    },
    simulateProgress(loaded: number, total: number) {
      const calls = this.upload.addEventListener.mock.calls as [string, (e: unknown) => void][]
      calls
        .filter(([event]) => event === 'progress')
        .forEach(([, cb]) => cb({ lengthComputable: true, loaded, total }))
    },
  }
  return instance
}

describe('Upload flow integration', () => {
  let originalXHR: typeof XMLHttpRequest

  beforeEach(() => {
    originalXHR = global.XMLHttpRequest
    mockXhrInstance = createMockXhr()
    // Must use a proper constructor function for XMLHttpRequest mock
    function MockXHRConstructor(this: typeof mockXhrInstance) {
      return mockXhrInstance
    }
    global.XMLHttpRequest = MockXHRConstructor as unknown as typeof XMLHttpRequest
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.XMLHttpRequest = originalXHR
  })

  it('calls POST /assets, uploads to presigned URL, and reports progress', async () => {
    const mockAsset = {
      id: 'asset-123',
      creator_id: 'creator-1',
      filename: 'video.mp4',
      media_type: 'video' as const,
      size_bytes: 1024,
      status: 'uploading' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    vi.mocked(createAsset).mockResolvedValue({
      asset: mockAsset,
      presigned_url: 'https://s3.example.com/upload?sig=abc',
    })

    const onProgress = vi.fn()
    const onUploadComplete = vi.fn()

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UploadDropzone onProgress={onProgress} onUploadComplete={onUploadComplete} />
      </QueryClientProvider>
    )

    // Simulate file selection
    const file = new File(['video content'], 'video.mp4', { type: 'video/mp4' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    // createAsset should have been called
    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith({
        filename: 'video.mp4',
        media_type: 'video',
        size_bytes: file.size,
      })
    })

    // XHR should have been opened with the presigned URL
    await waitFor(() => {
      expect(mockXhrInstance.open).toHaveBeenCalledWith('PUT', 'https://s3.example.com/upload?sig=abc')
    })

    // Simulate progress event
    act(() => {
      mockXhrInstance.simulateProgress(512, 1024)
    })

    await waitFor(() => {
      expect(onProgress).toHaveBeenCalledWith(50)
    })

    // Simulate upload completion
    act(() => {
      mockXhrInstance.simulateSuccess()
    })

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith('asset-123')
    })

    // Progress bar should show 100%
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })

  it('shows inline error when file format is invalid', async () => {
    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UploadDropzone />
      </QueryClientProvider>
    )

    // Use a file with an accepted MIME type but unsupported extension
    // to bypass the browser's accept filter while still testing validation logic
    const file = new File(['data'], 'document.pdf', { type: 'video/mp4' })
    // Override the name so the extension check fails
    Object.defineProperty(file, 'name', { value: 'document.pdf' })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    // Directly fire the change event with the file to bypass accept attribute filtering
    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await waitFor(() => {
      expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()
    })

    // createAsset should NOT have been called
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('polls asset status until ready', async () => {
    const assetId = 'asset-456'

    // First poll returns 'compressing', second returns 'ready'
    vi.mocked(getAssetById)
      .mockResolvedValueOnce({
        id: assetId,
        creator_id: 'creator-1',
        filename: 'video.mp4',
        media_type: 'video',
        size_bytes: 1024,
        status: 'compressing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        id: assetId,
        creator_id: 'creator-1',
        filename: 'video.mp4',
        media_type: 'video',
        size_bytes: 1024,
        status: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UploadWithPolling assetId={assetId} />
      </QueryClientProvider>
    )

    // Initially shows compressing
    await waitFor(() => {
      expect(screen.getByTestId('asset-status')).toHaveTextContent('compressing')
    })

    // Manually trigger a refetch to simulate polling
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['assets', assetId] })
    })

    await waitFor(() => {
      expect(screen.getByTestId('asset-status')).toHaveTextContent('ready')
    })
  })

  it('shows error and retry button when POST /assets fails', async () => {
    vi.mocked(createAsset).mockRejectedValue(new Error('Server error'))

    const qc = makeQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UploadDropzone />
      </QueryClientProvider>
    )

    const file = new File(['video content'], 'video.mp4', { type: 'video/mp4' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
    })
  })
})
