import { createClient } from '@supabase/supabase-js'

// Public client — used in API routes for read-only leaderboard queries.
// Respects RLS. Safe to use in server components.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Admin client — bypasses RLS. Used ONLY in the sync job (server-side).
// NEVER import this in client components or expose to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
