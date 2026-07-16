import { formatMetric } from '@/lib/validation'

interface MetricCardProps {
  name: string
  value: number | null | undefined
}

export default function MetricCard({ name, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{name}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{formatMetric(value)}</p>
    </div>
  )
}
