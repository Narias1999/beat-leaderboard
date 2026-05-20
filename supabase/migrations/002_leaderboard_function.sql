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
    ROUND((SUM(act.distance) / 1000.0)::numeric, 1)      AS total_distance_km,
    ROUND(SUM(act.total_elevation_gain)::numeric, 0)      AS total_elevation_m,
    COUNT(act.activity_id)                                AS activity_count
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
