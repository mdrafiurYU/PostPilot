import type { Insight } from '@/types'

interface InsightCardProps {
  insight: Insight
}

const impactIndicator: Record<string, { symbol: string; className: string }> = {
  positive: { symbol: '↑', className: 'text-green-600' },
  negative: { symbol: '↓', className: 'text-red-600' },
  neutral: { symbol: '→', className: 'text-gray-500' },
}

export default function InsightCard({ insight }: InsightCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Insights</h3>
      <ul className="flex flex-col gap-3">
        {insight.factors.map((factor, i) => {
          const indicator = impactIndicator[factor.impact] ?? impactIndicator.neutral
          return (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 text-base font-bold ${indicator.className}`}>
                {indicator.symbol}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800">{factor.label}</p>
                <p className="text-sm text-gray-500">{factor.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
