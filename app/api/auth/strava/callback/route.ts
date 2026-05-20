import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, isClubMember } from '@/lib/strava'

import { pool } from '@/lib/db'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/connect?error=access_denied`)
  }

  try {
    const data = await exchangeCodeForTokens(code)
    const { athlete } = data

    const clubId = process.env.STRAVA_CLUB_ID!
    const isMember = await isClubMember(data.access_token, clubId)

    await pool.query(
      `INSERT INTO athletes (athlete_id, firstname, lastname, profile_medium, access_token, refresh_token, token_expires_at, is_club_member)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (athlete_id) DO UPDATE SET
         firstname        = EXCLUDED.firstname,
         lastname         = EXCLUDED.lastname,
         profile_medium   = EXCLUDED.profile_medium,
         access_token     = EXCLUDED.access_token,
         refresh_token    = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         is_club_member   = EXCLUDED.is_club_member,
         updated_at       = NOW()`,
      [
        athlete.id,
        athlete.firstname,
        athlete.lastname,
        athlete.profile_medium ?? null,
        data.access_token,
        data.refresh_token,
        data.expires_at,
        isMember,
      ]
    )

    return NextResponse.redirect(`${baseUrl}/connect?success=true`)
  } catch (err) {
    console.error('[strava-callback]', err)
    return NextResponse.redirect(`${baseUrl}/connect?error=token_exchange_failed`)
  }
}
