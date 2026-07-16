import { apiClient } from '@/lib/apiClient'
import type { Post } from '@/types'

export const batchesKeys = {
  detail: (id: string) => ['batches', id] as const,
}

export async function createBatch(data: {
  posts: Partial<Post>[]
}): Promise<{ id: string; posts: Post[] }> {
  const res = await apiClient.post<{ id: string; posts: Post[] }>('/batches', data)
  return res.data
}

export async function getBatch(id: string): Promise<{ id: string; posts: Post[] }> {
  const res = await apiClient.get<{ id: string; posts: Post[] }>(`/batches/${id}`)
  return res.data
}
