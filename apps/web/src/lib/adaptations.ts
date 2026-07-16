import type { Adaptation, Platform } from '@/types'

export function groupByPlatform(adaptations: Adaptation[]): Map<Platform, Adaptation[]> {
  const map = new Map<Platform, Adaptation[]>()
  for (const adaptation of adaptations) {
    const existing = map.get(adaptation.platform) ?? []
    map.set(adaptation.platform, [...existing, adaptation])
  }
  return map
}
