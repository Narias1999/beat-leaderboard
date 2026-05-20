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
