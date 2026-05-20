# Strava Club Leaderboard — Sync Job

## Overview

The sync job runs twice daily via Vercel Cron. It:
1. Gets a fresh Strava access token (via refresh token exchange)
2. Fetches club members to keep athlete profiles current
3. Fetches club activities incrementally (only newer than last successful sync)
4. Upserts all data into Supabase (idempotent — safe to run multiple times)
5. Records the outcome in `sync_log`

---

## Vercel Cron Configuration

**File: `vercel.json`** (project root)

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 6,18 * * *"
    }
  ]
}
```

This fires `POST /api/cron/sync` at 06:00 UTC and 18:00 UTC every day.

Vercel automatically adds an `Authorization: Bearer {CRON_SECRET}` header to cron requests when the `CRON_SECRET` env var is set in the project. Always validate this header in the route handler.

---

## Cron Route Handler

**File: `app/api/cron/sync/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runSync } from '@/lib/sync'

export const maxDuration = 60  // allow up to 60s for the sync (Vercel hobby: max 60s)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSync()
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync] fatal error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

## Sync Logic

**File: `lib/sync.ts`**

```typescript
import { getStravaAccessToken, fetchClubMembers, fetchClubActivities } from './strava'
import { supabaseAdmin } from './supabase'

export interface SyncResult {
  athletes_upserted: number
  activities_upserted: number
  status: 'success' | 'error'
  error_message?: string
}

export async function runSync(): Promise<SyncResult> {
  const clubId = process.env.STRAVA_CLUB_ID!
  let athletesUpserted = 0
  let activitiesUpserted = 0

  try {
    // STEP 1: Fresh Strava access token
    const accessToken = await getStravaAccessToken()

    // STEP 2: Get last successful sync timestamp (incremental watermark)
    const { data: lastSync } = await supabaseAdmin
      .from('sync_log')
      .select('synced_at')
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()

    // null on first run — fetchClubActivities will fetch all available history
    const lastSyncDate: Date | null = lastSync ? new Date(lastSync.synced_at) : null

    // STEP 3: Fetch members and activities in parallel
    const [members, activities] = await Promise.all([
      fetchClubMembers(clubId, accessToken),
      fetchClubActivities(clubId, accessToken, lastSyncDate),
    ])

    // STEP 4: Upsert athletes from the members list
    if (members.length > 0) {
      const memberRows = members.map(m => ({
        athlete_id: m.id,
        firstname: m.firstname,
        lastname: m.lastname,
        profile_medium: m.profile_medium ?? null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabaseAdmin
        .from('athletes')
        .upsert(memberRows, { onConflict: 'athlete_id' })

      if (error) throw new Error(`Athlete upsert failed: ${error.message}`)
      athletesUpserted += memberRows.length
    }

    // STEP 5: Upsert any athletes found in activities but not in the members list
    // (former members whose historical activities are still in the club feed)
    const memberIds = new Set(members.map(m => m.id))
    const extraAthleteMap = new Map<number, { id: number; firstname: string; lastname: string }>()

    for (const a of activities) {
      if (!memberIds.has(a.athlete.id) && !extraAthleteMap.has(a.athlete.id)) {
        extraAthleteMap.set(a.athlete.id, a.athlete)
      }
    }

    if (extraAthleteMap.size > 0) {
      const extraRows = [...extraAthleteMap.values()].map(a => ({
        athlete_id: a.id,
        firstname: a.firstname,
        lastname: a.lastname,
        profile_medium: null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabaseAdmin
        .from('athletes')
        .upsert(extraRows, { onConflict: 'athlete_id' })

      if (error) throw new Error(`Extra athlete upsert failed: ${error.message}`)
      athletesUpserted += extraRows.length
    }

    // STEP 6: Upsert activities in batches of 500
    if (activities.length > 0) {
      const activityRows = activities.map(a => ({
        activity_id: a.id,
        athlete_id: a.athlete.id,
        name: a.name ?? null,
        type: a.type,
        distance: a.distance,
        total_elevation_gain: a.total_elevation_gain,
        moving_time: a.moving_time,
        start_date: a.start_date,
      }))

      const BATCH_SIZE = 500
      for (let i = 0; i < activityRows.length; i += BATCH_SIZE) {
        const batch = activityRows.slice(i, i + BATCH_SIZE)
        const { error } = await supabaseAdmin
          .from('activities')
          .upsert(batch, { onConflict: 'activity_id' })

        if (error) throw new Error(`Activity upsert failed (batch ${i / BATCH_SIZE + 1}): ${error.message}`)
      }

      activitiesUpserted = activityRows.length
    }

    // STEP 7: Write success to sync_log
    await supabaseAdmin.from('sync_log').insert({
      synced_at: new Date().toISOString(),
      activities_upserted: activitiesUpserted,
      athletes_upserted: athletesUpserted,
      status: 'success',
    })

    return { athletes_upserted: athletesUpserted, activities_upserted: activitiesUpserted, status: 'success' }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Record failure in sync_log — next cron run will retry automatically
    await supabaseAdmin.from('sync_log').insert({
      synced_at: new Date().toISOString(),
      activities_upserted: activitiesUpserted,
      athletes_upserted: athletesUpserted,
      status: 'error',
      error_message: message,
    }).catch(() => {}) // swallow DB error so we still return a structured response

    return { athletes_upserted: athletesUpserted, activities_upserted: activitiesUpserted, status: 'error', error_message: message }
  }
}
```

---

## First-Run: Seed Historical Data

On first deployment, trigger a manual sync to fetch all available club history (~26 weeks of Strava club activity data). This request may take 30–90 seconds.

```bash
# After deploying to Vercel
curl -X POST https://YOUR_VERCEL_URL/api/cron/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "athletes_upserted": 84,
  "activities_upserted": 1532,
  "status": "success"
}
```

After this succeeds, all subsequent cron runs are incremental and process only new activities since the last sync.

---

## Error Recovery

| Failure scenario | Behavior |
|-----------------|---------|
| Transient network error | `sync_log` records error; next cron run automatically retries |
| Strava 401 (invalid token) | Error message in `sync_log.error_message`; re-run OAuth flow (Step 2 of `03-strava-api.md`) and update `STRAVA_REFRESH_TOKEN` in Vercel |
| Strava 429 (rate limit) | `lib/strava.ts` waits 15 min and retries once automatically |
| Supabase error | Recorded in `sync_log`; investigate via Supabase SQL editor |

## Monitoring

- **Sync history**: Query `sync_log` table in Supabase table editor
- **Vercel logs**: Vercel Dashboard → Project → Logs → filter by `/api/cron/sync`
- **Cron history**: Vercel Dashboard → Project → Settings → Cron Jobs

To manually inspect recent syncs:
```sql
SELECT synced_at, activities_upserted, athletes_upserted, status, error_message
FROM sync_log
ORDER BY synced_at DESC
LIMIT 20;
```
