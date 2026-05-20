// --- Database row types ---

export interface Athlete {
  athlete_id: number
  firstname: string
  lastname: string
  profile_medium: string | null
  access_token: string
  refresh_token: string
  token_expires_at: number
  connected_at: string
  updated_at: string
}

export interface Activity {
  activity_id: number
  athlete_id: number
  name: string | null
  type: string
  sport_type: string | null
  distance: number
  total_elevation_gain: number
  moving_time: number
  elapsed_time: number
  start_date: string
  created_at: string
}

export interface SyncLog {
  id: number
  synced_at: string
  activities_upserted: number
  athletes_synced: number
  status: 'success' | 'error'
  error_message: string | null
}

// --- API response types ---

export type Period = 'all' | 'ytd' | 'month' | 'week'
export type SortField = 'distance' | 'elevation'

export interface LeaderboardEntry {
  rank: number
  athlete_id: number
  firstname: string
  lastname: string
  profile_medium: string | null
  total_distance_km: number
  total_elevation_m: number
  activity_count: number
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  last_synced_at: string | null
  period: Period
  sort: SortField
}

// --- Strava API types ---

export interface StravaTokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
  athlete: StravaAthlete
}

export interface StravaAthlete {
  id: number
  firstname: string
  lastname: string
  profile_medium: string
  profile: string
}

export interface StravaSummaryActivity {
  id: number
  athlete: { id: number }
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  type: string
  sport_type: string
  start_date: string
  start_date_local: string
}
