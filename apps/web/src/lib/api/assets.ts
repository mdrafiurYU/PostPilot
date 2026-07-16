import { apiClient } from '@/lib/apiClient'
import type { Asset, Adaptation } from '@/types'

export const assetsKeys = {
  all: ['assets'] as const,
  detail: (id: string) => ['assets', id] as const,
  adaptations: (id: string) => ['assets', id, 'adaptations'] as const,
}

export async function getAssets(): Promise<Asset[]> {
  const res = await apiClient.get<Asset[]>('/assets')
  return res.data
}

export async function getAssetById(id: string): Promise<Asset> {
  const res = await apiClient.get<Asset>(`/assets/${id}`)
  return res.data
}

export async function createAsset(data: {
  filename: string
  media_type: string
  size_bytes: number
}): Promise<{ asset: Asset; presigned_url: string }> {
  const res = await apiClient.post<{ asset: Asset; presigned_url: string }>('/assets', data)
  return res.data
}

export async function getAdaptations(assetId: string): Promise<Adaptation[]> {
  const res = await apiClient.get<Adaptation[]>(`/assets/${assetId}/adaptations`)
  return res.data
}
