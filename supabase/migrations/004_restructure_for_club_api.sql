-- The Strava club endpoints (members + activities) do not return athlete IDs,
-- activity IDs, or start_date. Restructure to use name-based identity and
-- composite keys for deduplication.

DROP FUNCTION IF EXISTS get_leaderboard(TIMESTAMPTZ, TEXT);
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS athletes CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;

-- Athletes keyed by (firstname, lastname)
CREATE TABLE athletes (
  id SERIAL PRIMARY KEY,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  profile_medium TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (firstname, lastname)
);

-- Activities deduplicated by a composite of athlete + measurable fields
CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT NOT NULL,
  sport_type TEXT,
  distance FLOAT NOT NULL DEFAULT 0,
  total_elevation_gain FLOAT NOT NULL DEFAULT 0,
  moving_time INT NOT NULL DEFAULT 0,
  elapsed_time INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, name, distance, moving_time, type, total_elevation_gain)
);

-- Sync log (unchanged)
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activities_upserted INT DEFAULT 0,
  athletes_upserted INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT
);

-- Indexes
CREATE INDEX idx_activities_athlete_id ON activities(athlete_id);
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX idx_activities_athlete_created ON activities(athlete_id, created_at DESC);
CREATE INDEX idx_sync_log_synced_at ON sync_log(synced_at DESC);

-- RLS
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read athletes"  ON athletes  FOR SELECT USING (true);
CREATE POLICY "Public read activities" ON activities FOR SELECT USING (true);
CREATE POLICY "Public read sync_log"  ON sync_log  FOR SELECT USING (true);

-- Leaderboard function using created_at for period filtering
CREATE OR REPLACE FUNCTION get_leaderboard(date_filter TIMESTAMPTZ, sort_by TEXT)
RETURNS TABLE (
  athlete_id     INT,
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
    a.id AS athlete_id,
    a.firstname,
    a.lastname,
    a.profile_medium,
    ROUND((SUM(act.distance) / 1000.0)::numeric, 1)   AS total_distance_km,
    ROUND(SUM(act.total_elevation_gain)::numeric, 0)   AS total_elevation_m,
    COUNT(act.id)                                      AS activity_count
  FROM athletes a
  INNER JOIN activities act ON a.id = act.athlete_id
  WHERE act.created_at >= date_filter
  GROUP BY a.id, a.firstname, a.lastname, a.profile_medium
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
