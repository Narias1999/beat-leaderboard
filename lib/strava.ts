import type { StravaTokenResponse, StravaSummaryActivity } from '@/types'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

export function getStravaAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/strava/callback`,
    response_type: 'code',
    scope: 'read,activity:read_all',
    approval_prompt: 'auto',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export async function exchangeCodeForTokens(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`)
  }

  return res.json()
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`)
  }

  return res.json()
}

export async function isClubMember(accessToken: string, clubId: string): Promise<boolean> {
  const res = await fetch(`${STRAVA_API_BASE}/athlete/clubs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return false
  const clubs: { id: number }[] = await res.json()
  return clubs.some(c => String(c.id) === clubId)
}

export async function fetchAthleteActivities(
  accessToken: string,
  after?: number
): Promise<StravaSummaryActivity[]> {
  const all: StravaSummaryActivity[] = []
  let page = 1

  while (true) {
    let url = `${STRAVA_API_BASE}/athlete/activities?per_page=200&page=${page}`
    if (after) url += `&after=${after}`
    console.log(url);

    const batch = await fetchPage<StravaSummaryActivity>(url, accessToken)
    if (batch.length === 0) break
    all.push(...batch.filter(a => a.type.toLowerCase().includes('ride')))
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
    throw new Error('Strava access token invalid or expired.')
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
