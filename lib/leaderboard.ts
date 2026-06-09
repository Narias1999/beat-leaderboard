import { pool } from './db'
import type { Period, SortField, LeaderboardEntry, LeaderboardResponse } from '@/types'

export function getDateFilter(period: Period): string {
  const now = new Date()
  switch (period) {
    case 'week': {
      const day = now.getDay()
      const daysFromMonday = day === 0 ? 6 : day - 1
      const monday = new Date(now)
      monday.setDate(now.getDate() - daysFromMonday)
      monday.setHours(0, 0, 0, 0)
      return monday.toISOString()
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1).toISOString()
    case 'all':
      return new Date('2022-01-01T00:00:00Z').toISOString()
  }
}

export async function queryLeaderboard(
  period: Period,
  sort: SortField
): Promise<LeaderboardResponse> {
  const dateFilter = getDateFilter(period)

  const [leaderboardResult, syncResult] = await Promise.all([
    pool.query<{
      athlete_id: string
      firstname: string
      lastname: string
      profile_medium: string | null
      total_distance_km: string
      total_elevation_m: string
      activity_count: string
    }>(
      `SELECT
        a.athlete_id,
        a.firstname,
        a.lastname,
        a.profile_medium,
        ROUND((SUM(act.distance) / 1000.0)::numeric, 1)     AS total_distance_km,
        ROUND(SUM(act.total_elevation_gain)::numeric, 0)     AS total_elevation_m,
        COUNT(act.activity_id)                               AS activity_count
      FROM athletes a
      INNER JOIN activities act ON a.athlete_id = act.athlete_id
      WHERE a.is_club_member = true
        AND act.start_date >= $1
      GROUP BY a.athlete_id, a.firstname, a.lastname, a.profile_medium
      ORDER BY
        CASE WHEN $2 = 'elevation'
          THEN SUM(act.total_elevation_gain)
          ELSE SUM(act.distance)
        END DESC`,
      [dateFilter, sort]
    ),
    pool.query<{ synced_at: string }>(
      `SELECT synced_at FROM sync_log WHERE status = 'success' ORDER BY synced_at DESC LIMIT 1`
    ),
  ])

  const entries: LeaderboardEntry[] = leaderboardResult.rows.map((row, index) => ({
    rank: index + 1,
    athlete_id: Number(row.athlete_id),
    firstname: row.firstname,
    lastname: row.lastname,
    profile_medium: row.profile_medium,
    total_distance_km: parseFloat(row.total_distance_km),
    total_elevation_m: parseInt(row.total_elevation_m, 10),
    activity_count: parseInt(row.activity_count, 10),
  }))

  return {
    entries,
    last_synced_at: syncResult.rows[0]?.synced_at ?? null,
    period,
    sort,
  }
}
