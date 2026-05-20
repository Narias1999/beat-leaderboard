import { NextResponse } from 'next/server'
import { getStravaAuthorizeUrl } from '@/lib/strava'

export async function GET() {
  return NextResponse.redirect(getStravaAuthorizeUrl())
}
