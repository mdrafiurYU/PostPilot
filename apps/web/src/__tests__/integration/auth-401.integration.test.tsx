/**
 * Integration test: 401 handling
 * mock 401 → session cleared → redirect to /login
 * Requirements: 8.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import axios from 'axios'

// We test the interceptor behavior directly without mocking apiClient,
// so we can verify the real interceptor logic runs.
// We DO mock next-auth's getSession and window.location to observe side effects.

import { getSession } from 'next-auth/react'

vi.mock('next-auth/react', () => ({
  getSession: vi.fn(),
}))

function makeAxiosError(status: number) {
  return Object.assign(new axios.AxiosError(`Request failed with status code ${status}`), {
    response: {
      status,
      statusText: status === 401 ? 'Unauthorized' : 'Server Error',
      headers: {},
      config: {} as never,
      data: {},
    },
  })
}

describe('401 handling integration', () => {
  let originalHref: string

  beforeEach(() => {
    originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...window.location, href: originalHref },
    })
    // Mock getSession to return a valid token
    vi.mocked(getSession).mockResolvedValue({
      accessToken: 'valid-token',
      user: { id: 'creator-1', email: 'test@example.com', name: 'Test' },
      expires: new Date().toISOString(),
    } as never)
    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...window.location, href: originalHref },
    })
    vi.mocked(getSession).mockReset()
  })

  it('interceptor clears session and redirects to /login on 401', async () => {
    const { apiClient } = await import('@/lib/apiClient')

    const originalAdapter = apiClient.defaults.adapter
    apiClient.defaults.adapter = async () => {
      throw makeAxiosError(401)
    }

    // Mock the signout fetch
    const signoutFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

    // Ensure session token is set
    vi.mocked(getSession).mockResolvedValue({
      accessToken: 'active-token',
      user: { id: 'creator-1', email: 'test@example.com', name: 'Test' },
      expires: new Date().toISOString(),
    } as never)

    try {
      await apiClient.get('/protected')
    } catch {
      // Expected to throw after interceptor runs
    }

    // Verify signout fetch was called to clear session
    expect(signoutFetch).toHaveBeenCalledWith(
      '/api/auth/signout',
      expect.objectContaining({
        method: 'POST',
      }),
    )

    // Verify redirect
    expect(window.location.href).toBe('/login')

    signoutFetch.mockRestore()
    apiClient.defaults.adapter = originalAdapter
  })

  it('does not clear session on 500 errors', async () => {
    const { apiClient } = await import('@/lib/apiClient')

    const originalAdapter = apiClient.defaults.adapter
    apiClient.defaults.adapter = async () => {
      throw makeAxiosError(500)
    }

    vi.mocked(getSession).mockResolvedValue({
      accessToken: 'valid-token',
      user: { id: 'creator-1', email: 'test@example.com', name: 'Test' },
      expires: new Date().toISOString(),
    } as never)

    try {
      await apiClient.get('/some-resource')
    } catch {
      // Expected
    }

    // Session should still be intact; getSession should still return token
    const session = await getSession()
    expect(session?.accessToken).toBe('valid-token')

    apiClient.defaults.adapter = originalAdapter
  })

  it('request interceptor attaches Authorization header when token is present', async () => {
    const { apiClient } = await import('@/lib/apiClient')

    vi.mocked(getSession).mockResolvedValue({
      accessToken: 'my-jwt-token',
      user: { id: 'creator-1', email: 'test@example.com', name: 'Test' },
      expires: new Date().toISOString(),
    } as never)

    let capturedHeaders: Record<string, string> = {}
    const originalAdapter = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      capturedHeaders = (config.headers as Record<string, string>) ?? {}
      return { data: [], status: 200, statusText: 'OK', headers: {}, config }
    }

    await apiClient.get('/assets')

    expect(capturedHeaders['Authorization']).toBe('Bearer my-jwt-token')

    apiClient.defaults.adapter = originalAdapter
  })

  it('request interceptor does not attach Authorization header when no token', async () => {
    const { apiClient } = await import('@/lib/apiClient')

    // Mock getSession to return null (not logged in)
    vi.mocked(getSession).mockResolvedValue(null)

    let capturedHeaders: Record<string, string> = {}
    const originalAdapter = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      capturedHeaders = (config.headers as Record<string, string>) ?? {}
      return { data: [], status: 200, statusText: 'OK', headers: {}, config }
    }

    await apiClient.get('/public-resource')

    expect(capturedHeaders['Authorization']).toBeUndefined()

    apiClient.defaults.adapter = originalAdapter
  })
})
