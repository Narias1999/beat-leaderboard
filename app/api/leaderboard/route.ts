import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Period, SortField, LeaderboardEntry, LeaderboardResponse } from '@/types'

const VALID_PERIODS: Period[] = ['all', 'ytd', 'month', 'week']
const VALID_SORTS: SortField[] = ['distance', 'elevation']

function getDateFilter(period: Period): string {
  const now = new Date()
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1).toISOString()
    case 'all':
      return new Date(0).toISOString()
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const period = (searchParams.get('period') ?? 'all') as Period
  const sort = (searchParams.get('sort') ?? 'distance') as SortField

  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json(
      { error: `Invalid period: must be one of ${VALID_PERIODS.join(', ')}` },
      { status: 400 }
    )
  }
  if (!VALID_SORTS.includes(sort)) {
    return NextResponse.json(
      { error: `Invalid sort: must be one of ${VALID_SORTS.join(', ')}` },
      { status: 400 }
    )
  }

  const dateFilter = getDateFilter(period)

  const [leaderboardResult, syncResult] = await Promise.all([
    supabase.rpc('get_leaderboard', {
      date_filter: dateFilter,
      sort_by: sort,
    }),
    supabase
      .from('sync_log')
      .select('synced_at')
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (leaderboardResult.error) {
    console.error('[leaderboard] query error:', leaderboardResult.error)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }

  const entries: LeaderboardEntry[] = (leaderboardResult.data ?? []).map(
    (row: any, index: number) => ({
      rank: index + 1,
      athlete_id: Number(row.athlete_id),
      firstname: row.firstname as string,
      lastname: row.lastname as string,
      profile_medium: row.profile_medium as string | null,
      total_distance_km: parseFloat(row.total_distance_km),
      total_elevation_m: parseInt(row.total_elevation_m, 10),
      activity_count: parseInt(row.activity_count, 10),
    })
  )

  const response: LeaderboardResponse = {
    entries,
    last_synced_at: syncResult.data?.synced_at ?? null,
    period,
    sort,
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
