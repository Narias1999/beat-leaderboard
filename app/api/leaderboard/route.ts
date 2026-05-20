import { NextRequest, NextResponse } from 'next/server'
import { queryLeaderboard } from '@/lib/leaderboard'
import type { Period, SortField } from '@/types'

const VALID_PERIODS: Period[] = ['all', 'ytd', 'month', 'week']
const VALID_SORTS: SortField[] = ['distance', 'elevation']

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

  try {
    const data = await queryLeaderboard(period, sort)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[leaderboard]', message)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
}
