import { useQuery } from '@tanstack/react-query'
import { getAssetById, assetsKeys } from '@/lib/api/assets'

export function useAssetPolling(id: string) {
  return useQuery({
    queryKey: assetsKeys.detail(id),
    queryFn: () => getAssetById(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'ready' || status === 'failed' ? false : 10_000
    },
  })
}
