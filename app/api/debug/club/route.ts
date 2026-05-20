import { NextResponse } from 'next/server'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

async function getToken(): Promise<string> {
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
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
}

export async function GET() {
  try {
    const clubId = process.env.STRAVA_CLUB_ID!
    const token = await getToken()

    const [membersRes, activitiesRes] = await Promise.all([
      fetch(`${STRAVA_API_BASE}/clubs/${clubId}/members?per_page=200`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${STRAVA_API_BASE}/clubs/${clubId}/activities?per_page=200`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])

    const members = membersRes.ok ? await membersRes.json() : { error: membersRes.status }
    const activities = activitiesRes.ok ? await activitiesRes.json() : { error: activitiesRes.status }

    return NextResponse.json({ members, activities })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
