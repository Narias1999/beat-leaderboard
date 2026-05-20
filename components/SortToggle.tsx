import Link from 'next/link'
import type { Period, SortField } from '@/types'

interface SortToggleProps {
  currentSort: SortField
  currentPeriod: Period
}

export default function SortToggle({ currentSort, currentPeriod }: SortToggleProps) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      <Link
        href={`?period=${currentPeriod}&sort=distance`}
        className={`px-4 py-2 text-sm font-medium transition-colors ${
          currentSort === 'distance'
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Distance
      </Link>
      <Link
        href={`?period=${currentPeriod}&sort=elevation`}
        className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${
          currentSort === 'elevation'
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Elevation
      </Link>
    </div>
  )
}
