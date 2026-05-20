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
    const accessToken = await getStravaAccessToken()

    const { data: lastSync } = await supabaseAdmin
      .from('sync_log')
      .select('synced_at')
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()

    const lastSyncDate: Date | null = lastSync ? new Date(lastSync.synced_at) : null

    const [members, activities] = await Promise.all([
      fetchClubMembers(clubId, accessToken),
      fetchClubActivities(clubId, accessToken, lastSyncDate),
    ])

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

    await supabaseAdmin.from('sync_log').insert({
      synced_at: new Date().toISOString(),
      activities_upserted: activitiesUpserted,
      athletes_upserted: athletesUpserted,
      status: 'success',
    })

    return { athletes_upserted: athletesUpserted, activities_upserted: activitiesUpserted, status: 'success' }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    try {
      await supabaseAdmin.from('sync_log').insert({
        synced_at: new Date().toISOString(),
        activities_upserted: activitiesUpserted,
        athletes_upserted: athletesUpserted,
        status: 'error',
        error_message: message,
      })
    } catch {
      // swallow — we still return a structured response
    }

    return { athletes_upserted: athletesUpserted, activities_upserted: activitiesUpserted, status: 'error', error_message: message }
  }
}
