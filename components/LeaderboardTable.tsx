import Image from 'next/image'
import type { LeaderboardEntry, SortField } from '@/types'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  sort: SortField
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function formatDistance(km: number): string {
  return `${km.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

function formatElevation(m: number): string {
  return `${m.toLocaleString('en', { maximumFractionDigits: 0 })} m`
}

function AvatarFallback({ firstname, lastname }: { firstname: string; lastname: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
      {firstname[0]}{lastname[0]}
    </div>
  )
}

export default function LeaderboardTable({ entries, sort }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
        No activities recorded for this period.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Desktop table (sm and above) */}
      <table className="w-full hidden sm:table">
        <thead>
          <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <th className="text-left pl-6 pr-3 py-3 w-12">#</th>
            <th className="text-left px-3 py-3">Rider</th>
            <th className="text-right px-3 py-3">
              <span className={sort === 'distance' ? 'text-orange-500' : ''}>Distance</span>
            </th>
            <th className="text-right px-3 py-3">
              <span className={sort === 'elevation' ? 'text-orange-500' : ''}>Elevation</span>
            </th>
            <th className="text-right pl-3 pr-6 py-3">Rides</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr
              key={entry.athlete_id}
              className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                i === 0 ? 'bg-orange-50/40' : ''
              }`}
            >
              <td className="pl-6 pr-3 py-4 text-sm font-bold text-gray-400 w-12">
                {MEDAL[entry.rank] ?? entry.rank}
              </td>
              <td className="px-3 py-4">
                <div className="flex items-center gap-3">
                  {entry.profile_medium ? (
                    <Image
                      src={entry.profile_medium}
                      alt={`${entry.firstname} ${entry.lastname}`}
                      width={36}
                      height={36}
                      className="rounded-full flex-shrink-0"
                      unoptimized
                    />
                  ) : (
                    <AvatarFallback firstname={entry.firstname} lastname={entry.lastname} />
                  )}
                  <span className="font-medium text-gray-900">
                    {entry.firstname} {entry.lastname}
                  </span>
                </div>
              </td>
              <td className="px-3 py-4 text-right text-sm font-semibold text-gray-800">
                {formatDistance(entry.total_distance_km)}
              </td>
              <td className="px-3 py-4 text-right text-sm text-gray-600">
                {formatElevation(entry.total_elevation_m)}
              </td>
              <td className="pl-3 pr-6 py-4 text-right text-sm text-gray-400">
                {entry.activity_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card list (below sm) */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {entries.map((entry) => (
          <li key={entry.athlete_id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm font-bold text-gray-400 w-6 flex-shrink-0 text-center">
              {MEDAL[entry.rank] ?? entry.rank}
            </span>
            {entry.profile_medium ? (
              <Image
                src={entry.profile_medium}
                alt={`${entry.firstname} ${entry.lastname}`}
                width={32}
                height={32}
                className="rounded-full flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                {entry.firstname[0]}{entry.lastname[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">
                {entry.firstname} {entry.lastname}
              </p>
              <p className="text-xs text-gray-400">
                {entry.activity_count} {entry.activity_count === 1 ? 'activity' : 'activities'}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-semibold ${sort === 'distance' ? 'text-gray-900' : 'text-gray-600'}`}>
                {formatDistance(entry.total_distance_km)}
              </p>
              <p className={`text-xs ${sort === 'elevation' ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                {formatElevation(entry.total_elevation_m)} elev
              </p>
            </div>
          </li>
        ))}
      </ul>

    </div>
  )
}
