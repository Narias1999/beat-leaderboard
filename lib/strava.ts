import type { StravaClubMember, StravaClubActivity, StravaTokenResponse } from '@/types'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

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
      if (newActivities.length < batch.length) break
    } else {
      all.push(...batch)
    }

    if (batch.length < 200) break
    page++
  }

  return all
}

async function fetchPage<T>(url: string, accessToken: string): Promise<T[]> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) {
    throw new Error('Strava access token invalid. Re-run the OAuth flow to get a new refresh token.')
  }

  if (res.status === 429) {
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
