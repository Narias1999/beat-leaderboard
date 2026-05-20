import { Suspense } from 'react'
import Link from 'next/link'
import FilterBar from '@/components/FilterBar'
import SortToggle from '@/components/SortToggle'
import LeaderboardTable from '@/components/LeaderboardTable'
import LastSyncedBadge from '@/components/LastSyncedBadge'
import { queryLeaderboard } from '@/lib/leaderboard'
import type { Period, SortField } from '@/types'

interface PageProps {
  searchParams: Promise<{ period?: string; sort?: string }>
}

const VALID_PERIODS: Period[] = ['all', 'ytd', 'month', 'week']
const VALID_SORTS: SortField[] = ['distance', 'elevation']

export default async function Home({ searchParams }: PageProps) {
  const { period: periodParam, sort: sortParam } = await searchParams

  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : 'all'

  const sort: SortField = VALID_SORTS.includes(sortParam as SortField)
    ? (sortParam as SortField)
    : 'distance'

  const data = await queryLeaderboard(period, sort)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Club Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-1">Strava club activity rankings</p>
        </div>
        <div className="flex items-center gap-3">
          <LastSyncedBadge lastSyncedAt={data.last_synced_at} />
          <Link
            href="/connect"
            className="text-xs font-medium text-[#FC4C02] hover:text-[#e04400] transition-colors"
          >
            Connect
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <FilterBar currentPeriod={period} currentSort={sort} />
        <div className="sm:ml-auto">
          <SortToggle currentSort={sort} currentPeriod={period} />
        </div>
      </div>

      <Suspense fallback={<div className="text-center py-16 text-gray-400">Loading...</div>}>
        <LeaderboardTable entries={data.entries} sort={sort} />
      </Suspense>
    </main>
  )
}
