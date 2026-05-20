-- Athletes
CREATE TABLE athletes (
  athlete_id BIGINT PRIMARY KEY,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  profile_medium TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities
CREATE TABLE activities (
  activity_id BIGINT PRIMARY KEY,
  athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
  name TEXT,
  type TEXT NOT NULL,
  distance FLOAT NOT NULL DEFAULT 0,
  total_elevation_gain FLOAT NOT NULL DEFAULT 0,
  moving_time INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync log
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activities_upserted INT DEFAULT 0,
  athletes_upserted INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT
);

-- Indexes for leaderboard aggregation queries
CREATE INDEX idx_activities_athlete_id ON activities(athlete_id);
CREATE INDEX idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX idx_activities_athlete_date ON activities(athlete_id, start_date DESC);

-- Index for last-sync lookup
CREATE INDEX idx_sync_log_synced_at ON sync_log(synced_at DESC);

-- Enable RLS on all tables
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Public read — leaderboard is public, no login required
CREATE POLICY "Public read athletes"
  ON athletes FOR SELECT USING (true);

CREATE POLICY "Public read activities"
  ON activities FOR SELECT USING (true);

CREATE POLICY "Public read sync_log"
  ON sync_log FOR SELECT USING (true);

-- Writes are performed using SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- No INSERT/UPDATE policies needed.
