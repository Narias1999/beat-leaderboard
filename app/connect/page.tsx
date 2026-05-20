import { pool } from '@/lib/db'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ success?: string; error?: string }>
}

export default async function ConnectPage({ searchParams }: PageProps) {
  const { success, error } = await searchParams

  const { rows: athletes } = await pool.query<{
    athlete_id: number
    firstname: string
    lastname: string
    is_club_member: boolean
    connected_at: string
  }>(`SELECT athlete_id, firstname, lastname, is_club_member, connected_at FROM athletes ORDER BY is_club_member DESC, connected_at DESC`)

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        &larr; Back to leaderboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect with Strava</h1>
      <p className="text-sm text-gray-500 mb-8">
        Authorize the app to read your activities so they appear on the club leaderboard.
      </p>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-6 text-sm">
          Account connected successfully.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {error === 'access_denied'
            ? 'Authorization was denied. Please try again.'
            : error === 'not_a_member'
              ? 'You must be a member of the club to connect.'
              : 'Something went wrong connecting your account. Please try again.'}
        </div>
      )}

      <a
        href="/api/auth/strava"
        className="inline-flex items-center gap-2 bg-[#FC4C02] hover:bg-[#e04400] text-white font-semibold px-5 py-3 rounded-lg transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        Connect with Strava
      </a>

      {athletes.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Connected athletes ({athletes.length})
          </h2>
          <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {athletes.map(a => (
              <li key={a.athlete_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">
                    {a.firstname} {a.lastname}
                  </span>
                  {a.is_club_member ? (
                    <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Member</span>
                  ) : (
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Not in club</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(a.connected_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
