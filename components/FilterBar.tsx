import Link from 'next/link'
import type { Period, SortField } from '@/types'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all',   label: 'All Time' },
  { value: 'ytd',   label: 'Year to Date' },
  { value: 'month', label: 'This Month' },
  { value: 'week',  label: 'This Week' },
]

interface FilterBarProps {
  currentPeriod: Period
  currentSort: SortField
}

export default function FilterBar({ currentPeriod, currentSort }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERIODS.map(({ value, label }) => (
        <Link
          key={value}
          href={`?period=${value}&sort=${currentSort}`}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            currentPeriod === value
              ? 'bg-orange-500 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
