-- Switch from club endpoints (no IDs, no dates) to per-athlete OAuth.
-- Each athlete authorizes the app and we fetch their activities directly,
-- giving us real Strava IDs, start_date, and full activity data.

DROP FUNCTION IF EXISTS get_leaderboard(TIMESTAMPTZ, TEXT);
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS athletes CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;

CREATE TABLE athletes (
  athlete_id BIGINT PRIMARY KEY,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  profile_medium TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at BIGINT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE activities (
  activity_id BIGINT PRIMARY KEY,
  athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
  name TEXT,
  type TEXT NOT NULL,
  sport_type TEXT,
  distance FLOAT NOT NULL DEFAULT 0,
  total_elevation_gain FLOAT NOT NULL DEFAULT 0,
  moving_time INT NOT NULL DEFAULT 0,
  elapsed_time INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activities_upserted INT DEFAULT 0,
  athletes_synced INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT
);

CREATE INDEX idx_activities_athlete_id ON activities(athlete_id);
CREATE INDEX idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX idx_activities_athlete_date ON activities(athlete_id, start_date DESC);
CREATE INDEX idx_sync_log_synced_at ON sync_log(synced_at DESC);

ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read athletes"  ON athletes  FOR SELECT USING (true);
CREATE POLICY "Public read activities" ON activities FOR SELECT USING (true);
CREATE POLICY "Public read sync_log"  ON sync_log  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION get_leaderboard(date_filter TIMESTAMPTZ, sort_by TEXT)
RETURNS TABLE (
  athlete_id     BIGINT,
  firstname      TEXT,
  lastname       TEXT,
  profile_medium TEXT,
  total_distance_km  NUMERIC,
  total_elevation_m  NUMERIC,
  activity_count     BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.athlete_id,
    a.firstname,
    a.lastname,
    a.profile_medium,
    ROUND((SUM(act.distance) / 1000.0)::numeric, 1)   AS total_distance_km,
    ROUND(SUM(act.total_elevation_gain)::numeric, 0)   AS total_elevation_m,
    COUNT(act.activity_id)                             AS activity_count
  FROM athletes a
  INNER JOIN activities act ON a.athlete_id = act.athlete_id
  WHERE act.start_date >= date_filter
  GROUP BY a.athlete_id, a.firstname, a.lastname, a.profile_medium
  ORDER BY
    CASE WHEN sort_by = 'elevation'
      THEN SUM(act.total_elevation_gain)
      ELSE SUM(act.distance)
    END DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_leaderboard(TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
