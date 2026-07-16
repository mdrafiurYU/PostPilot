interface RecommendationCardProps {
  attributes: string[]
}

export default function RecommendationCard({ attributes }: RecommendationCardProps) {
  const displayed = attributes.slice(0, 5)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Channel Recommendations</h3>
      <ul className="flex flex-col gap-1.5">
        {displayed.map((attr, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            {attr}
          </li>
        ))}
      </ul>
    </div>
  )
}
