// --- Database row types ---

export interface Athlete {
  athlete_id: number
  firstname: string
  lastname: string
  profile_medium: string | null
  updated_at: string
}

export interface Activity {
  activity_id: number
  athlete_id: number
  name: string | null
  type: string
  distance: number           // meters
  total_elevation_gain: number  // meters
  moving_time: number        // seconds
  start_date: string         // ISO 8601 UTC
  created_at: string
}

export interface SyncLog {
  id: number
  synced_at: string
  activities_upserted: number
  athletes_upserted: number
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
  total_distance_km: number    // already converted from meters
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

export interface StravaClubMember {
  id: number
  resource_state: number
  firstname: string
  lastname: string
  profile_medium: string
  profile: string
  city: string
  state: string
  country: string
  sex: string
  premium: boolean
}

export interface StravaClubActivity {
  id: number
  resource_state: number
  athlete: {
    id: number
    resource_state: number
    firstname: string
    lastname: string
  }
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  type: string
  sport_type: string
  start_date: string         // ISO 8601 UTC
  start_date_local: string
  timezone: string
  utc_offset: number
  achievement_count: number
  kudos_count: number
  comment_count: number
  athlete_count: number
  photo_count: number
  trainer: boolean
  commute: boolean
  manual: boolean
  private: boolean
  flagged: boolean
  average_speed: number
  max_speed: number
}

export interface StravaTokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
}
