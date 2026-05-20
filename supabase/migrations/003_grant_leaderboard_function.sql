GRANT EXECUTE ON FUNCTION get_leaderboard(TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
