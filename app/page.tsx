import { Suspense } from 'react'
import FilterBar from '@/components/FilterBar'
import SortToggle from '@/components/SortToggle'
import LeaderboardTable from '@/components/LeaderboardTable'
import LastSyncedBadge from '@/components/LastSyncedBadge'
import type { Period, SortField, LeaderboardResponse } from '@/types'

interface PageProps {
  searchParams: { period?: string; sort?: string }
}

async function getLeaderboard(period: Period, sort: SortField): Promise<LeaderboardResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(
    `${baseUrl}/api/leaderboard?period=${period}&sort=${sort}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
  return res.json()
}

const VALID_PERIODS: Period[] = ['all', 'ytd', 'month', 'week']
const VALID_SORTS: SortField[] = ['distance', 'elevation']

export default async function Home({ searchParams }: PageProps) {
  const period: Period = VALID_PERIODS.includes(searchParams.period as Period)
    ? (searchParams.period as Period)
    : 'all'

  const sort: SortField = VALID_SORTS.includes(searchParams.sort as SortField)
    ? (searchParams.sort as SortField)
    : 'distance'

  const data = await getLeaderboard(period, sort)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Club Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-1">Strava club activity rankings</p>
        </div>
        <LastSyncedBadge lastSyncedAt={data.last_synced_at} />
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
