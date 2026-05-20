# Strava Club Leaderboard — Frontend UI

## Technology

- **Framework**: Next.js 14 App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3
- **Rendering**: Server components for initial page; navigation links for filter/sort (no client-side state needed)
- **Responsive**: Desktop table + mobile card list

## Key Design Decision: URL-Driven Filters

Filter and sort state live in URL search params (`?period=week&sort=elevation`). This means:
- Filters work without JavaScript
- URLs are bookmarkable/shareable
- Browser back/forward works naturally
- No `useState` or hydration complexity

---

## File List

All files to create:

```
app/layout.tsx
app/page.tsx
app/globals.css
components/LeaderboardTable.tsx
components/FilterBar.tsx
components/SortToggle.tsx
components/LastSyncedBadge.tsx
next.config.ts
tailwind.config.ts
```

---

## `app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

---

## `next.config.ts`

Allow `next/image` to load profile photos from Strava's CDN.

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dgalywyr863hv.cloudfront.net',  // Strava profile photo CDN
      },
      {
        protocol: 'https',
        hostname: '*.cloudfront.net',               // Catch other Strava CDN subdomains
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',       // Google avatars (some Strava users)
      },
    ],
  },
}

export default nextConfig
```

---

## `app/layout.tsx`

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Club Leaderboard',
  description: 'Strava club activity leaderboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
```

---

## `app/page.tsx`

Server component. Reads URL search params, fetches leaderboard data server-side, passes to client components.

```typescript
import { Suspense } from 'react'
import FilterBar from '@/components/FilterBar'
import SortToggle from '@/components/SortToggle'
import LeaderboardTable from '@/components/LeaderboardTable'
import LastSyncedBadge from '@/components/LastSyncedBadge'
import type { Period, SortField, LeaderboardResponse } from '@/types'

interface PageProps {
  searchParams: { period?: string; sort?: string }
}

async function getLeaderboard(period: Period, sort: SortField): Promise<LeaderboardResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(
    `${baseUrl}/api/leaderboard?period=${period}&sort=${sort}`,
    { next: { revalidate: 300 } }   // ISR: revalidate every 5 minutes
  )
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
  return res.json()
}

const VALID_PERIODS: Period[] = ['all', 'ytd', 'month', 'week']
const VALID_SORTS: SortField[] = ['distance', 'elevation']

export default async function Home({ searchParams }: PageProps) {
  const period: Period = VALID_PERIODS.includes(searchParams.period as Period)
    ? (searchParams.period as Period)
    : 'all'

  const sort: SortField = VALID_SORTS.includes(searchParams.sort as SortField)
    ? (searchParams.sort as SortField)
    : 'distance'

  const data = await getLeaderboard(period, sort)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Club Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-1">Strava club activity rankings</p>
        </div>
        <LastSyncedBadge lastSyncedAt={data.last_synced_at} />
      </div>

      {/* Filter + Sort controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <FilterBar currentPeriod={period} currentSort={sort} />
        <div className="sm:ml-auto">
          <SortToggle currentSort={sort} currentPeriod={period} />
        </div>
      </div>

      {/* Leaderboard */}
      <Suspense fallback={<div className="text-center py-16 text-gray-400">Loading...</div>}>
        <LeaderboardTable entries={data.entries} sort={sort} />
      </Suspense>
    </main>
  )
}
```

---

## `components/FilterBar.tsx`

Period filter tabs rendered as `<Link>` elements — pure navigation, no JS state.

```typescript
import Link from 'next/link'
import type { Period, SortField } from '@/types'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all',   label: 'All Time' },
  { value: 'ytd',   label: 'Year to Date' },
  { value: 'month', label: 'This Month' },
  { value: 'week',  label: 'This Week' },
]

interface FilterBarProps {
  currentPeriod: Period
  currentSort: SortField
}

export default function FilterBar({ currentPeriod, currentSort }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERIODS.map(({ value, label }) => (
        <Link
          key={value}
          href={`?period=${value}&sort=${currentSort}`}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            currentPeriod === value
              ? 'bg-orange-500 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
```

---

## `components/SortToggle.tsx`

Toggle between distance and elevation sort.

```typescript
import Link from 'next/link'
import type { Period, SortField } from '@/types'

interface SortToggleProps {
  currentSort: SortField
  currentPeriod: Period
}

export default function SortToggle({ currentSort, currentPeriod }: SortToggleProps) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      <Link
        href={`?period=${currentPeriod}&sort=distance`}
        className={`px-4 py-2 text-sm font-medium transition-colors ${
          currentSort === 'distance'
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Distance
      </Link>
      <Link
        href={`?period=${currentPeriod}&sort=elevation`}
        className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${
          currentSort === 'elevation'
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Elevation
      </Link>
    </div>
  )
}
```

---

## `components/LastSyncedBadge.tsx`

Displays a relative "Updated X hours ago" timestamp.

```typescript
interface LastSyncedBadgeProps {
  lastSyncedAt: string | null
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function LastSyncedBadge({ lastSyncedAt }: LastSyncedBadgeProps) {
  if (!lastSyncedAt) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
      <span>Updated {formatRelativeTime(lastSyncedAt)}</span>
    </div>
  )
}
```

---

## `components/LeaderboardTable.tsx`

Main table component. Renders a full table on desktop and a card list on mobile.

```typescript
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

      {/* ── Desktop table (sm and above) ── */}
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

      {/* ── Mobile card list (below sm) ── */}
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
```

---

## Visual Summary

**Desktop:**
```
┌─────────────────────────────────────────────────────────┐
│ Club Leaderboard                        Updated 3h ago  │
│ Strava club activity rankings                           │
│                                                         │
│ [All Time] [Year to Date] [This Month] [This Week]  [Distance|Elevation] │
│                                                         │
│  #   Rider                  Distance   Elevation  Rides │
│ ─────────────────────────────────────────────────────── │
│ 🥇  [img] Maria Garcia     342.5 km    4,820 m    18   │
│ 🥈  [img] Carlos Lopez     298.1 km    3,210 m    14   │
│ 🥉  [img] Ana Fernandez    275.0 km    2,890 m    12   │
│  4  [img] ...                                           │
└─────────────────────────────────────────────────────────┘
```

**Mobile:**
```
┌─────────────────────────┐
│ Club Leaderboard        │
│              Updated 3h │
│                         │
│ [All] [YTD] [Mo] [Wk]  │
│ [Distance | Elevation]  │
│ ─────────────────────── │
│ 🥇 [img] Maria Garcia  │
│         18 activities   │
│              342.5 km   │
│             4,820 m elv │
│ ─────────────────────── │
│ 🥈 [img] Carlos Lopez  │
│         14 activities   │
│              298.1 km   │
└─────────────────────────┘
```
