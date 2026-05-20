# Strava Club Leaderboard — Strava API Integration

## Overview

A single Strava OAuth account (the club admin or any club member) authenticates the background sync job. No per-rider login is required. The integration uses two endpoints:

1. `GET /clubs/{id}/members` — fetch athlete profiles (names + profile photos)
2. `GET /clubs/{id}/activities` — fetch all recent activities across all club members

---

## Step 1: Register Your Strava App

1. Go to https://www.strava.com/settings/api
2. Click **Create & Manage Your App**
3. Fill in:
   - **Application Name**: anything (e.g. "Club Leaderboard")
   - **Category**: Data Importer
   - **Website**: your Vercel URL (use `http://localhost` for now)
   - **Authorization Callback Domain**: `localhost` (update to your Vercel domain post-deploy)
4. After creation, note:
   - **Client ID** → save as `STRAVA_CLIENT_ID`
   - **Client Secret** → save as `STRAVA_CLIENT_SECRET`

---

## Step 2: Obtain Your Refresh Token (One-Time)

You authorize your own Strava account once to get a long-lived refresh token. The sync job uses this token indefinitely.

### 2a — Open the Authorization URL

Replace `YOUR_CLIENT_ID` and open in a browser:

```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read
```

**Required scopes:**
- `read` — access to public club data and member list
- `activity:read` — access to the club activity feed

After approving, Strava redirects to a URL like:
```
http://localhost/?state=&code=AUTHORIZATION_CODE&scope=read,activity:read
```

Copy the `code` value from the URL.

### 2b — Exchange Code for Tokens

```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=AUTHORIZATION_CODE \
  -d grant_type=authorization_code
```

**Response:**
```json
{
  "token_type": "Bearer",
  "expires_at": 1234567890,
  "expires_in": 21600,
  "refresh_token": "YOUR_LONG_LIVED_REFRESH_TOKEN",
  "access_token": "SHORT_LIVED_ACCESS_TOKEN",
  "athlete": { ... }
}
```

Save `refresh_token` as `STRAVA_REFRESH_TOKEN`. The access token expires in 6 hours — always exchange the refresh token at sync time instead of storing access tokens.

---

## Step 3: Find Your Club ID

**Option A — Via API** (using the access token from step 2b):
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://www.strava.com/api/v3/athlete/clubs"
```
Find your club in the response array and note the `"id"` field.

**Option B — From the Strava website**: Visit your club page on Strava. The URL shows the club slug, but the numeric ID is visible in the page source or via the API call above.

Save the numeric club ID as `STRAVA_CLUB_ID`.

---

## API Endpoints

### GET /clubs/{id}/members

Returns paginated club member profiles. Used to keep the `athletes` table current with names and profile photos.

```
GET https://www.strava.com/api/v3/clubs/{STRAVA_CLUB_ID}/members
Authorization: Bearer {ACCESS_TOKEN}
Query params: per_page=200&page=1
```

Paginate by incrementing `page` until the response array length is less than `per_page`.

**Response item** (one object per member):
```typescript
{
  id: number              // athlete_id — use as FK in activities
  resource_state: number
  firstname: string
  lastname: string
  profile_medium: string  // 62×62px photo URL
  profile: string         // full-size photo URL
  city: string
  state: string
  country: string
  sex: string
  premium: boolean
}
```

### GET /clubs/{id}/activities

Returns recent activities from ALL club members using the single authenticated token. This is the core data source for the leaderboard.

```
GET https://www.strava.com/api/v3/clubs/{STRAVA_CLUB_ID}/activities
Authorization: Bearer {ACCESS_TOKEN}
Query params: per_page=200&page=1
```

Activities are returned in reverse chronological order. Paginate until a page returns fewer than 200 items, or until you reach activities older than your watermark date.

**Response item** (one object per activity):
```typescript
{
  id: number              // activity_id — use as PK
  resource_state: number
  athlete: {
    id: number            // athlete_id — links to athletes table
    resource_state: number
    firstname: string
    lastname: string
  }
  name: string
  distance: number                // meters
  moving_time: number             // seconds
  elapsed_time: number            // seconds
  total_elevation_gain: number    // meters
  type: string                    // "Ride", "Run", "Walk", "Hike", etc.
  sport_type: string
  start_date: string              // ISO 8601 UTC: "2024-01-15T08:30:00Z"
  start_date_local: string
  timezone: string
  utc_offset: number
  achievement_count: number
  kudos_count: number
  trainer: boolean
  commute: boolean
  manual: boolean
  private: boolean
  average_speed: number           // m/s
  max_speed: number               // m/s
}
```

---

## Rate Limits

Default Strava developer app limits:
- **100 requests per 15 minutes**
- **1,000 requests per day**

With `per_page=200`, 10,000 activities requires only 50 requests. Running twice daily with incremental updates, typical usage is 2–6 requests per sync. Rate limits are not a concern for this project.

On HTTP 429 response: wait 15 minutes before retrying (see `lib/strava.ts` error handling).

---

## `lib/strava.ts` — Full Implementation

**File: `lib/strava.ts`**

```typescript
import type { StravaClubMember, StravaClubActivity, StravaTokenResponse } from '@/types'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

/**
 * Exchange the stored refresh token for a fresh access token.
 * Called at the start of every sync run.
 * Never cache the access token — serverless functions don't share memory between invocations.
 */
export async function getStravaAccessToken(): Promise<string> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`)
  }

  const data: StravaTokenResponse = await res.json()
  return data.access_token
}

/**
 * Fetch all club members with profile info.
 * Paginates automatically until all members are retrieved.
 */
export async function fetchClubMembers(
  clubId: string,
  accessToken: string
): Promise<StravaClubMember[]> {
  const all: StravaClubMember[] = []
  let page = 1

  while (true) {
    const url = `${STRAVA_API_BASE}/clubs/${clubId}/members?per_page=200&page=${page}`
    const batch = await fetchPage<StravaClubMember>(url, accessToken)
    all.push(...batch)
    if (batch.length < 200) break
    page++
  }

  return all
}

/**
 * Fetch club activities, optionally stopping at a watermark date.
 *
 * - If afterDate is null (first run): paginates through all available history.
 * - If afterDate is set (incremental): stops once a page contains only older activities.
 *
 * Activities are returned newest-first from the API.
 */
export async function fetchClubActivities(
  clubId: string,
  accessToken: string,
  afterDate: Date | null
): Promise<StravaClubActivity[]> {
  const all: StravaClubActivity[] = []
  let page = 1

  while (true) {
    const url = `${STRAVA_API_BASE}/clubs/${clubId}/activities?per_page=200&page=${page}`
    const batch = await fetchPage<StravaClubActivity>(url, accessToken)

    if (batch.length === 0) break

    if (afterDate !== null) {
      const newActivities = batch.filter(a => new Date(a.start_date) > afterDate)
      all.push(...newActivities)
      // If this page contains any activity older than our watermark, stop paginating
      if (newActivities.length < batch.length) break
    } else {
      all.push(...batch)
    }

    if (batch.length < 200) break  // last page
    page++
  }

  return all
}

/**
 * Fetch a single page from the Strava API.
 * Handles 401 (bad token) and 429 (rate limit) explicitly.
 */
async function fetchPage<T>(url: string, accessToken: string): Promise<T[]> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) {
    throw new Error('Strava access token invalid. Re-run the OAuth flow to get a new refresh token.')
  }

  if (res.status === 429) {
    // Rate limited — wait 15 minutes and retry once
    await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000))
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!retry.ok) {
      throw new Error(`Strava API error after rate limit retry: ${retry.status}`)
    }
    return retry.json()
  }

  if (!res.ok) {
    throw new Error(`Strava API error: ${res.status} ${url}`)
  }

  return res.json()
}
```
