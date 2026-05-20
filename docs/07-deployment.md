# Strava Club Leaderboard — Deployment Guide

## Prerequisites

- [ ] Node.js 18+ installed locally
- [ ] Vercel account (free hobby plan) — https://vercel.com
- [ ] Supabase account (free tier) — https://supabase.com
- [ ] Strava API app registered + refresh token obtained (see `03-strava-api.md`)
- [ ] Strava club ID obtained (see `03-strava-api.md` Step 3)

---

## Step 1: Initialize the Next.js Project

```bash
npx create-next-app@latest strava_integration \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"

cd strava_integration

# Install Supabase JS client
npm install @supabase/supabase-js
```

This sets up Next.js 14 with TypeScript, Tailwind CSS, ESLint, App Router, and the `@/*` import alias.

---

## Step 2: Create All Source Files

Create every file specified in documents `02-database.md` through `06-ui-components.md`. Final file tree:

```
├── app/
│   ├── api/cron/sync/route.ts
│   ├── api/leaderboard/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── FilterBar.tsx
│   ├── LastSyncedBadge.tsx
│   ├── LeaderboardTable.tsx
│   └── SortToggle.tsx
├── lib/
│   ├── strava.ts
│   ├── supabase.ts
│   └── sync.ts
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql
│       └── 002_leaderboard_function.sql
├── types/
│   └── index.ts
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
└── vercel.json
```

---

## Step 3: Set Up Supabase

1. Go to https://supabase.com → New project
2. Choose a region close to your users
3. From **Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
4. Open **SQL Editor** and run `supabase/migrations/001_initial.sql` (full content)
5. Then run `supabase/migrations/002_leaderboard_function.sql`

Verify tables exist: go to **Table Editor** — you should see `athletes`, `activities`, `sync_log`.

---

## Step 4: Configure Environment Variables

**File: `.env.local`** — create at project root. Never commit this file.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123def456...
STRAVA_REFRESH_TOKEN=your_refresh_token_from_oauth_flow
STRAVA_CLUB_ID=123456
CRON_SECRET=generate_this_below
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Generate `CRON_SECRET`:
```bash
openssl rand -hex 32
```

**File: `.env.local.example`** — commit this as a template for other developers:
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
STRAVA_CLUB_ID=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**`.gitignore`** — ensure these are excluded (Next.js adds `.env.local` by default):
```
.env.local
.env*.local
```

---

## Step 5: Run Locally

```bash
npm run dev
```

App runs at http://localhost:3000. Table will be empty until you run the first sync.

**Trigger sync manually in local dev:**
```bash
# In a second terminal (with dev server running)
curl -X POST http://localhost:3000/api/cron/sync \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

**Check leaderboard API:**
```bash
curl "http://localhost:3000/api/leaderboard?period=all&sort=distance" | jq .
```

---

## Step 6: Deploy to Vercel

### Option A — Vercel CLI
```bash
npx vercel --prod
```

Follow the prompts. When asked about environment variables, skip for now — you'll set them in the dashboard.

### Option B — GitHub (recommended for continuous deployment)

1. Push your code to a GitHub repository
2. Go to https://vercel.com/new
3. Import the GitHub repository
4. Framework preset: **Next.js** (auto-detected)
5. Click **Deploy** — first deploy will fail (env vars not set yet, that's OK)

---

## Step 7: Set Vercel Environment Variables

Vercel Dashboard → Your Project → **Settings** → **Environment Variables**

Add each variable. Use the **Environment** column to restrict sensitive values:

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | — | — |
| `STRAVA_CLIENT_ID` | ✓ | — | — |
| `STRAVA_CLIENT_SECRET` | ✓ | — | — |
| `STRAVA_REFRESH_TOKEN` | ✓ | — | — |
| `STRAVA_CLUB_ID` | ✓ | — | — |
| `CRON_SECRET` | ✓ | — | — |
| `NEXT_PUBLIC_APP_URL` | ✓ (set to your `.vercel.app` URL) | ✓ | ✓ |

After saving env vars, trigger a redeployment:
- Vercel Dashboard → **Deployments** → latest deployment → **Redeploy**

---

## Step 8: Verify Cron Job

1. Vercel Dashboard → Project → **Settings** → **Cron Jobs**
2. You should see: `POST /api/cron/sync` | `0 6,18 * * *`

If it's missing, check that `vercel.json` is committed and the deployment succeeded.

**Test the cron endpoint on production:**
```bash
curl -X POST https://YOUR_APP.vercel.app/api/cron/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Step 9: Seed Historical Data

The first sync fetches all available club activity history (~26 weeks from Strava). Run it immediately after confirming the cron endpoint works:

```bash
curl -X POST https://YOUR_APP.vercel.app/api/cron/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

This may take 30–90 seconds. Expected response:
```json
{
  "athletes_upserted": 84,
  "activities_upserted": 1532,
  "status": "success"
}
```

Visit your app URL — the leaderboard should now be populated.

---

## Step 10: Update Strava App Settings

Go to https://www.strava.com/settings/api and update:
- **Authorization Callback Domain**: `your-app.vercel.app`

---

## `package.json` Reference

```json
{
  "name": "strava-leaderboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.x",
    "react": "^18",
    "react-dom": "^18",
    "@supabase/supabase-js": "^2"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3",
    "postcss": "^8",
    "autoprefixer": "^10",
    "eslint": "^8",
    "eslint-config-next": "14.2.x"
  }
}
```

---

## Monitoring Checklist

| Check | How |
|-------|-----|
| Sync running | Supabase → Table Editor → `sync_log` |
| Sync errors | Filter `sync_log` by `status = 'error'` |
| Vercel function logs | Vercel Dashboard → Logs → filter `/api/cron/sync` |
| Cron history | Vercel Dashboard → Settings → Cron Jobs |
| Data freshness | `last_synced_at` shown on the leaderboard page |

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Leaderboard empty after deploy | First sync not run | Trigger manual sync (Step 9) |
| `401 Unauthorized` on cron | `CRON_SECRET` mismatch | Verify env var matches header |
| Strava 401 in sync logs | Refresh token expired/revoked | Re-run OAuth flow, update `STRAVA_REFRESH_TOKEN` |
| `next/image` domain error | Strava CDN hostname not in `next.config.ts` | Add hostname to `remotePatterns` |
| Cron not showing in Vercel | `vercel.json` not committed | Commit file and redeploy |
