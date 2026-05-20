# Strava Club Leaderboard — Project Overview

## What We're Building

A public web leaderboard for a Strava cycling club (80+ riders). Data is synced from Strava twice daily and stored in PostgreSQL. The frontend reads only from the database — zero Strava API calls at page load time.

**Features:**
- Leaderboard table ranked by distance or elevation gain
- Time filters: All Time, Year to Date, Last Month, Last Week
- All activity types shown (cycling, running, walking, etc.)
- "Last updated" timestamp from most recent sync
- Fully mobile-responsive, no login required

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        VERCEL                            │
│                                                          │
│  ┌────────────────────┐    ┌────────────────────────┐   │
│  │   Next.js App      │    │  Vercel Cron (2x/day)  │   │
│  │   (App Router)     │    │  6:00 AM + 6:00 PM UTC │   │
│  │                    │    └───────────┬────────────┘   │
│  │  GET /             │                │ POST            │
│  │  (leaderboard)     │    ┌───────────▼────────────┐   │
│  │                    │    │  /api/cron/sync        │   │
│  │  GET /api/         │    │  (serverless function) │   │
│  │  leaderboard       │    └───────────┬────────────┘   │
│  └────────┬───────────┘                │                 │
│           │ SQL query                  │ upsert          │
└───────────┼────────────────────────────┼─────────────────┘
            │                            │
            ▼                            ▼
┌────────────────────────────────────────────────────────┐
│                SUPABASE (PostgreSQL)                   │
│                                                        │
│   athletes    activities    sync_log                   │
└────────────────────────────────────────────────────────┘
                                         ▲
                                         │ GET /clubs/{id}/activities
                                         │ GET /clubs/{id}/members
                                         │
                                ┌────────┴────────┐
                                │   STRAVA API    │
                                │      (v3)       │
                                └─────────────────┘
```

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) | Server components + API routes |
| Language | TypeScript | Strict mode |
| Database | PostgreSQL via Supabase | Free tier (500 MB storage) |
| Scheduled jobs | Vercel Cron Jobs | Built-in, free on hobby plan |
| Styling | Tailwind CSS 3 | Utility-first, responsive |
| Deployment | Vercel | Hobby plan (free) |

## Repository Structure

```
strava_integration/
├── app/
│   ├── layout.tsx                     — Root HTML layout
│   ├── page.tsx                       — Home page (server component)
│   ├── globals.css                    — Tailwind base imports
│   └── api/
│       ├── leaderboard/
│       │   └── route.ts               — GET /api/leaderboard
│       └── cron/
│           └── sync/
│               └── route.ts           — POST /api/cron/sync (Vercel Cron target)
├── components/
│   ├── LeaderboardTable.tsx           — Main ranked table
│   ├── FilterBar.tsx                  — Period filter tabs
│   ├── SortToggle.tsx                 — Distance / Elevation toggle
│   └── LastSyncedBadge.tsx            — "Updated X hours ago"
├── lib/
│   ├── supabase.ts                    — Supabase client instances
│   ├── strava.ts                      — Strava OAuth token refresh + API calls
│   └── sync.ts                        — Full sync job logic
├── types/
│   └── index.ts                       — All shared TypeScript interfaces
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql            — Tables, indexes, RLS
│       └── 002_leaderboard_function.sql — Aggregation SQL function
├── vercel.json                        — Cron schedule config
├── .env.local.example                 — Env var template (commit this)
├── .env.local                         — Actual secrets (never commit)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Environment Variables

Set in both `.env.local` (local dev) and Vercel project settings (production).

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `STRAVA_CLIENT_ID` | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | Strava app client secret |
| `STRAVA_REFRESH_TOKEN` | Long-lived refresh token from initial OAuth |
| `STRAVA_CLUB_ID` | Numeric Strava club ID |
| `CRON_SECRET` | Random secret to authorize cron endpoint |
| `NEXT_PUBLIC_APP_URL` | Full app URL (e.g. `https://your-app.vercel.app`) |

## Data Flow

**Sync (2× daily):**
1. Vercel Cron triggers `POST /api/cron/sync` with `Authorization: Bearer {CRON_SECRET}`
2. Sync job exchanges the stored refresh token for a new Strava access token
3. Fetches `GET /clubs/{STRAVA_CLUB_ID}/members` — upserts athlete profiles (name, photo)
4. Paginates `GET /clubs/{STRAVA_CLUB_ID}/activities` — stops when page < 200 items or watermark reached
5. Upserts all activities into `activities` table by `activity_id` (idempotent)
6. Writes success record to `sync_log`

**Page load:**
1. `app/page.tsx` reads `?period` and `?sort` URL search params
2. Fetches from `/api/leaderboard?period=all&sort=distance` (with ISR cache)
3. API route runs aggregation SQL function on Supabase
4. Returns ranked list + last sync timestamp
5. Filter/sort changes update URL params → server re-renders the page

## Implementation Order

Feed these documents to the implementing agent in order:

| Step | Document | What it creates |
|------|----------|----------------|
| 1 | `02-database.md` | SQL schema, migrations, TypeScript types |
| 2 | `03-strava-api.md` | Strava setup guide + `lib/strava.ts` |
| 3 | `04-sync-job.md` | `lib/sync.ts` + cron API route |
| 4 | `05-api-routes.md` | Leaderboard API route + SQL function |
| 5 | `06-ui-components.md` | All frontend components + pages |
| 6 | `07-deployment.md` | Project init, Vercel deploy, env vars |
