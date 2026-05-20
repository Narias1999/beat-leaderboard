# Strava Club Leaderboard — API Routes

## Routes Summary

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/leaderboard` | Fetch ranked leaderboard data |
| `POST` | `/api/cron/sync` | Trigger data sync (see `04-sync-job.md`) |

This document covers only the leaderboard route. The cron route is fully specified in `04-sync-job.md`.

---

## GET /api/leaderboard

### Query Parameters

| Param | Type | Default | Valid values |
|-------|------|---------|-------------|
| `period` | string | `all` | `all`, `ytd`, `month`, `week` |
| `sort` | string | `distance` | `distance`, `elevation` |

Invalid values return HTTP 400.

### Example Requests

```
GET /api/leaderboard
GET /api/leaderboard?period=week&sort=elevation
GET /api/leaderboard?period=ytd&sort=distance
```

### Response (200 OK)

```json
{
  "entries": [
    {
      "rank": 1,
      "athlete_id": 12345678,
      "firstname": "Maria",
      "lastname": "Garcia",
      "profile_medium": "https://dgalywyr863hv.cloudfront.net/pictures/athletes/...",
      "total_distance_km": 342.5,
      "total_elevation_m": 4820,
      "activity_count": 18
    }
  ],
  "last_synced_at": "2024-01-15T06:00:00.000Z",
  "period": "all",
  "sort": "distance"
}
```

`last_synced_at` is `null` if no successful sync has run yet.

### Error Responses

```json
// 400
{ "error": "Invalid period: must be one of all, ytd, month, week" }

// 400
{ "error": "Invalid sort: must be one of distance, elevation" }

// 500
{ "error": "Database query failed" }
```

---

## Implementation

### `app/api/leaderboard/route.ts`

```typescript
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
      return new Date(0).toISOString()  // Unix epoch — returns all records
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

  // Run leaderboard query and last-sync lookup in parallel
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
      // Cache at CDN for 5 minutes; serve stale for up to 10 minutes while revalidating.
      // Data only changes twice daily so this is very conservative.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
```

---

## Database Function

The leaderboard query uses a PostgreSQL function called via Supabase RPC. This keeps the aggregation logic in the database and avoids raw SQL strings in application code.

### `supabase/migrations/002_leaderboard_function.sql`

Run this in the Supabase SQL Editor **after** `001_initial.sql`.

```sql
CREATE OR REPLACE FUNCTION get_leaderboard(date_filter TIMESTAMPTZ, sort_by TEXT)
RETURNS TABLE (
  athlete_id     BIGINT,
  firstname      TEXT,
  lastname       TEXT,
  profile_medium TEXT,
  total_distance_km  NUMERIC,
  total_elevation_m  NUMERIC,
  activity_count     BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.athlete_id,
    a.firstname,
    a.lastname,
    a.profile_medium,
    ROUND((SUM(act.distance) / 1000.0)::numeric, 1)      AS total_distance_km,
    ROUND(SUM(act.total_elevation_gain)::numeric, 0)      AS total_elevation_m,
    COUNT(act.activity_id)                                AS activity_count
  FROM athletes a
  INNER JOIN activities act ON a.athlete_id = act.athlete_id
  WHERE act.start_date >= date_filter
  GROUP BY a.athlete_id, a.firstname, a.lastname, a.profile_medium
  ORDER BY
    CASE WHEN sort_by = 'elevation'
      THEN SUM(act.total_elevation_gain)
      ELSE SUM(act.distance)
    END DESC;
END;
$$ LANGUAGE plpgsql STABLE;
```

The function is marked `STABLE` (read-only, same inputs produce same outputs within a transaction) so PostgreSQL can optimize repeated calls.

---

## Caching Strategy

| Cache layer | TTL | Notes |
|-------------|-----|-------|
| Vercel CDN (`s-maxage`) | 5 min | Shared across all users |
| Next.js ISR (`revalidate`) | 5 min | Set in `app/page.tsx` fetch call |
| Stale-while-revalidate | 10 min | Serve cached data while refreshing in background |

Since data only changes twice per day, even a 1-hour cache would be acceptable. 5 minutes is conservative and ensures the "last updated" badge stays fresh.
