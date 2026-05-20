import { refreshAccessToken, fetchAthleteActivities, isClubMember } from './strava'
import { pool } from './db'

export interface SyncResult {
  athletes_synced: number
  activities_upserted: number
  status: 'success' | 'error'
  error_message?: string
}

export interface MembershipCheckResult {
  checked: number
  changed: number
  status: 'success' | 'error'
  error_message?: string
}

async function getValidToken(athlete: {
  athlete_id: number
  access_token: string
  refresh_token: string
  token_expires_at: number
}): Promise<string> {
  if (Date.now() / 1000 < athlete.token_expires_at - 60) {
    return athlete.access_token
  }
  const refreshed = await refreshAccessToken(athlete.refresh_token)
  await pool.query(
    `UPDATE athletes SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW()
     WHERE athlete_id = $4`,
    [refreshed.access_token, refreshed.refresh_token, refreshed.expires_at, athlete.athlete_id]
  )
  return refreshed.access_token
}

export async function checkMemberships(): Promise<MembershipCheckResult> {
  try {
    const { rows: athletes } = await pool.query<{
      athlete_id: number
      access_token: string
      refresh_token: string
      token_expires_at: number
      is_club_member: boolean
    }>(`SELECT athlete_id, access_token, refresh_token, token_expires_at, is_club_member FROM athletes`)

    const clubId = process.env.STRAVA_CLUB_ID!
    let changed = 0

    for (const athlete of athletes) {
      const accessToken = await getValidToken(athlete)
      const isMember = await isClubMember(accessToken, clubId)

      if (isMember !== athlete.is_club_member) {
        await pool.query(
          `UPDATE athletes SET is_club_member = $1, updated_at = NOW() WHERE athlete_id = $2`,
          [isMember, athlete.athlete_id]
        )
        changed++
      }
    }

    return { checked: athletes.length, changed, status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { checked: 0, changed: 0, status: 'error', error_message: message }
  }
}

export async function runSync(): Promise<SyncResult> {
  let athletesSynced = 0
  let activitiesUpserted = 0

  try {
    const { rows: athletes } = await pool.query<{
      athlete_id: number
      access_token: string
      refresh_token: string
      token_expires_at: number
      last_synced_at: string | null
    }>(`SELECT athlete_id, access_token, refresh_token, token_expires_at, last_synced_at FROM athletes WHERE is_club_member = true`)

    if (athletes.length === 0) {
      return { athletes_synced: 0, activities_upserted: 0, status: 'success' }
    }

    for (const athlete of athletes) {
      const accessToken = await getValidToken(athlete)
      const after = athlete.last_synced_at
        ? Math.floor(new Date(athlete.last_synced_at).getTime() / 1000)
        : undefined
      const activities = await fetchAthleteActivities(accessToken, after)

      if (activities.length > 0) {
        const BATCH_SIZE = 500
        for (let i = 0; i < activities.length; i += BATCH_SIZE) {
          const batch = activities.slice(i, i + BATCH_SIZE)
          await pool.query(
            `INSERT INTO activities (activity_id, athlete_id, name, type, sport_type, distance, total_elevation_gain, moving_time, elapsed_time, start_date)
             SELECT * FROM UNNEST(
               $1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[],
               $6::float[], $7::float[], $8::int[], $9::int[], $10::timestamptz[]
             ) AS t(activity_id, athlete_id, name, type, sport_type, distance, total_elevation_gain, moving_time, elapsed_time, start_date)
             ON CONFLICT (activity_id) DO UPDATE SET
               name                  = EXCLUDED.name,
               type                  = EXCLUDED.type,
               sport_type            = EXCLUDED.sport_type,
               distance              = EXCLUDED.distance,
               total_elevation_gain  = EXCLUDED.total_elevation_gain,
               moving_time           = EXCLUDED.moving_time,
               elapsed_time          = EXCLUDED.elapsed_time,
               start_date            = EXCLUDED.start_date`,
            [
              batch.map(a => a.id),
              batch.map(() => athlete.athlete_id),
              batch.map(a => a.name ?? null),
              batch.map(a => a.type),
              batch.map(a => a.sport_type ?? null),
              batch.map(a => a.distance),
              batch.map(a => a.total_elevation_gain),
              batch.map(a => a.moving_time),
              batch.map(a => a.elapsed_time),
              batch.map(a => a.start_date),
            ]
          )
        }
        activitiesUpserted += activities.length
      }

      await pool.query(
        `UPDATE athletes SET last_synced_at = NOW() WHERE athlete_id = $1`,
        [athlete.athlete_id]
      )
      athletesSynced++
    }

    await pool.query(
      `INSERT INTO sync_log (synced_at, activities_upserted, athletes_synced, status)
       VALUES ($1, $2, $3, 'success')`,
      [new Date().toISOString(), activitiesUpserted, athletesSynced]
    )

    return { athletes_synced: athletesSynced, activities_upserted: activitiesUpserted, status: 'success' }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    try {
      await pool.query(
        `INSERT INTO sync_log (synced_at, activities_upserted, athletes_synced, status, error_message)
         VALUES ($1, $2, $3, 'error', $4)`,
        [new Date().toISOString(), activitiesUpserted, athletesSynced, message]
      )
    } catch { /* swallow so we still return a structured response */ }

    return { athletes_synced: athletesSynced, activities_upserted: activitiesUpserted, status: 'error', error_message: message }
  }
}
