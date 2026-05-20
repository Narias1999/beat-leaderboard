# Strava Club Leaderboard — Database Design

## Database: Supabase (PostgreSQL)

Three tables. Schema is intentionally minimal.

## Tables

### `athletes`
One row per Strava athlete who has appeared in the club activity feed.

| Column | Type | Notes |
|--------|------|-------|
| `athlete_id` | `BIGINT` PRIMARY KEY | Strava athlete ID |
| `firstname` | `TEXT` NOT NULL | From Strava |
| `lastname` | `TEXT` NOT NULL | From Strava |
| `profile_medium` | `TEXT` | URL to 62×62 profile photo (nullable) |
| `updated_at` | `TIMESTAMPTZ` | Last time this row was refreshed |

### `activities`
One row per Strava activity. Primary key is Strava's own `activity_id` — upserts are idempotent.

| Column | Type | Notes |
|--------|------|-------|
| `activity_id` | `BIGINT` PRIMARY KEY | Strava activity ID |
| `athlete_id` | `BIGINT` NOT NULL FK | References `athletes.athlete_id` |
| `name` | `TEXT` | Activity name (nullable, for debugging) |
| `type` | `TEXT` NOT NULL | e.g. `"Ride"`, `"Run"`, `"Walk"` |
| `distance` | `FLOAT` NOT NULL | Meters |
| `total_elevation_gain` | `FLOAT` NOT NULL | Meters |
| `moving_time` | `INT` NOT NULL | Seconds |
| `start_date` | `TIMESTAMPTZ` NOT NULL | UTC start datetime |
| `created_at` | `TIMESTAMPTZ` | When we inserted this row |

### `sync_log`
One row per sync run. Used for auditing and the "last updated" badge on the page.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGSERIAL` PRIMARY KEY | Auto-increment |
| `synced_at` | `TIMESTAMPTZ` NOT NULL | When the sync ran |
| `activities_upserted` | `INT` | Count of activities processed |
| `athletes_upserted` | `INT` | Count of athletes updated |
| `status` | `TEXT` NOT NULL | `'success'` or `'error'` |
| `error_message` | `TEXT` | NULL on success, error details on failure |

---

## Migration Files

### `supabase/migrations/001_initial.sql`

Run this first in the Supabase SQL Editor.

```sql
-- Athletes
CREATE TABLE athletes (
  athlete_id BIGINT PRIMARY KEY,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  profile_medium TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities
CREATE TABLE activities (
  activity_id BIGINT PRIMARY KEY,
  athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
  name TEXT,
  type TEXT NOT NULL,
  distance FLOAT NOT NULL DEFAULT 0,
  total_elevation_gain FLOAT NOT NULL DEFAULT 0,
  moving_time INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync log
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activities_upserted INT DEFAULT 0,
  athletes_upserted INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT
);

-- Indexes for leaderboard aggregation queries
CREATE INDEX idx_activities_athlete_id ON activities(athlete_id);
CREATE INDEX idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX idx_activities_athlete_date ON activities(athlete_id, start_date DESC);

-- Index for last-sync lookup
CREATE INDEX idx_sync_log_synced_at ON sync_log(synced_at DESC);
```

### Row Level Security

Run this immediately after the table creation above (in the same migration or separately):

```sql
-- Enable RLS on all tables
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Public read — leaderboard is public, no login required
CREATE POLICY "Public read athletes"
  ON athletes FOR SELECT USING (true);

CREATE POLICY "Public read activities"
  ON activities FOR SELECT USING (true);

CREATE POLICY "Public read sync_log"
  ON sync_log FOR SELECT USING (true);

-- Writes are performed using SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- No INSERT/UPDATE policies needed.
```

---

## TypeScript Types

**File: `types/index.ts`**

Create this file at project root. All other files import types from here.

```typescript
// --- Database row types ---

export interface Athlete {
  athlete_id: number
  firstname: string
  lastname: string
  profile_medium: string | null
  updated_at: string
}

export interface Activity {
  activity_id: number
  athlete_id: number
  name: string | null
  type: string
  distance: number           // meters
  total_elevation_gain: number  // meters
  moving_time: number        // seconds
  start_date: string         // ISO 8601 UTC
  created_at: string
}

export interface SyncLog {
  id: number
  synced_at: string
  activities_upserted: number
  athletes_upserted: number
  status: 'success' | 'error'
  error_message: string | null
}

// --- API response types ---

export type Period = 'all' | 'ytd' | 'month' | 'week'
export type SortField = 'distance' | 'elevation'

export interface LeaderboardEntry {
  rank: number
  athlete_id: number
  firstname: string
  lastname: string
  profile_medium: string | null
  total_distance_km: number    // already converted from meters
  total_elevation_m: number
  activity_count: number
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  last_synced_at: string | null
  period: Period
  sort: SortField
}

// --- Strava API types ---

export interface StravaClubMember {
  id: number
  resource_state: number
  firstname: string
  lastname: string
  profile_medium: string
  profile: string
  city: string
  state: string
  country: string
  sex: string
  premium: boolean
}

export interface StravaClubActivity {
  id: number
  resource_state: number
  athlete: {
    id: number
    resource_state: number
    firstname: string
    lastname: string
  }
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  type: string
  sport_type: string
  start_date: string         // ISO 8601 UTC
  start_date_local: string
  timezone: string
  utc_offset: number
  achievement_count: number
  kudos_count: number
  comment_count: number
  athlete_count: number
  photo_count: number
  trainer: boolean
  commute: boolean
  manual: boolean
  private: boolean
  flagged: boolean
  average_speed: number
  max_speed: number
}

export interface StravaTokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
}
```

---

## Core Leaderboard Query

The leaderboard aggregation uses a PostgreSQL function (defined in `05-api-routes.md`). For reference, the equivalent raw SQL is:

```sql
SELECT
  a.athlete_id,
  a.firstname,
  a.lastname,
  a.profile_medium,
  ROUND((SUM(act.distance) / 1000.0)::numeric, 1)        AS total_distance_km,
  ROUND(SUM(act.total_elevation_gain)::numeric, 0)        AS total_elevation_m,
  COUNT(act.activity_id)                                  AS activity_count
FROM athletes a
INNER JOIN activities act ON a.athlete_id = act.athlete_id
WHERE act.start_date >= $1          -- ISO date string passed as parameter
GROUP BY a.athlete_id, a.firstname, a.lastname, a.profile_medium
ORDER BY
  CASE WHEN $2 = 'elevation'
    THEN SUM(act.total_elevation_gain)
    ELSE SUM(act.distance)
  END DESC;
```

**Date values by period** (computed in API route, not SQL):

| Period | Start date |
|--------|-----------|
| `all` | `new Date(0).toISOString()` — Unix epoch |
| `ytd` | `new Date(year, 0, 1).toISOString()` — Jan 1 this year |
| `month` | `new Date(year, month, 1).toISOString()` — 1st of this month |
| `week` | `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()` — rolling 7 days |

---

## Supabase Client Setup

**File: `lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

// Public client — used in API routes for read-only leaderboard queries.
// Respects RLS. Safe to use in server components.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Admin client — bypasses RLS. Used ONLY in the sync job (server-side).
// NEVER import this in client components or expose to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```
