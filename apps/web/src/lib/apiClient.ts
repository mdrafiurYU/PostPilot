import axios from 'axios'
import { getSession } from 'next-auth/react'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
})

apiClient.interceptors.request.use(async (config) => {
  const session = await getSession()
  const token = session?.accessToken as string | undefined
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // NextAuth signOut will clear the session and redirect to login
      await fetch('/api/auth/signout', { method: 'POST' })
      window.location.href = '/login'
    } else if (error.response?.status === 429) {
      console.warn('Too many requests')
    } else {
      return Promise.reject(error)
    }
    return Promise.reject(error)
  },
)
