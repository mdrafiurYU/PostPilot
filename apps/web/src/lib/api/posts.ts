import { apiClient } from '@/lib/apiClient'
import type { Post } from '@/types'

export const postsKeys = {
  all: ['posts'] as const,
  detail: (id: string) => ['posts', id] as const,
}

export async function getPosts(): Promise<Post[]> {
  const res = await apiClient.get<Post[]>('/posts')
  return res.data
}

export async function getPostById(id: string): Promise<Post> {
  const res = await apiClient.get<Post>(`/posts/${id}`)
  return res.data
}

export async function createPost(data: Partial<Post> & { caption?: string }): Promise<Post> {
  const res = await apiClient.post<Post>('/posts', data)
  return res.data
}

export async function updatePost(id: string, data: Partial<Post>): Promise<Post> {
  const res = await apiClient.patch<Post>(`/posts/${id}`, data)
  return res.data
}
