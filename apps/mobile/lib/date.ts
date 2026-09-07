/**
 * Consolidated relative-time formatters used across the mobile app.
 * Single source of truth for "Today / Yesterday / Wednesday / Mar 15" style labels
 * and shorter "2m / 5h / 3d ago" reviews-style labels.
 */

const MIN_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS  = 86_400_000

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/**
 * Day-bucketed label. Used for chat thread day headers and wallet day-grouped tx headers.
 *   Today · Yesterday · Wednesday · 15 Mar · 15 Mar 2024
 */
export function formatRelativeDay(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  const now  = new Date()

  if (isSameDay(date, now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return 'Yesterday'

  const diffDays = Math.floor((now.getTime() - date.getTime()) / DAY_MS)
  if (diffDays > 0 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' })
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Compact "X ago" label. Used for review timestamps (avatar header time slot).
 *   now · 2m · 5h · 3d · 2w · 15 Mar
 */
export function formatRelativeShort(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  const ms = Date.now() - date.getTime()
  if (ms < MIN_MS)        return 'now'
  const min = Math.floor(ms / MIN_MS)
  if (min < 60)           return `${min}m`
  const hr = Math.floor(ms / HOUR_MS)
  if (hr < 24)            return `${hr}h`
  const day = Math.floor(ms / DAY_MS)
  if (day < 7)            return `${day}d`
  if (day < 30)           return `${Math.floor(day / 7)}w`
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * Conversation-list trailing time slot. Mixes time-of-day for today and
 * date-based labels for older threads.
 *   2m · 14m · 9:42 am · Yest · Mon · 7 Apr · 12 Mar 2024
 */
export function formatConvoTime(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  const now  = new Date()
  const ms   = now.getTime() - date.getTime()

  if (isSameDay(date, now)) {
    if (ms < MIN_MS)            return 'now'
    const min = Math.floor(ms / MIN_MS)
    if (min < 60)               return `${min}m`
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  }

  const diffDays = Math.floor(ms / DAY_MS)
  if (diffDays === 1) return 'Yest'
  if (diffDays < 7)   return date.toLocaleDateString([], { weekday: 'short' })
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Day + time-of-day label used for chat group headers when present.
 *   Today 2:14 pm · Yesterday 6:02 pm · Mon 9:00 am · 15 Mar 8:30 am
 */
export function formatRelativeDayWithTime(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const day  = formatRelativeDay(date)
  return `${day} ${time}`
}

/* ─── Day-grouping reducer ──────────────────────────────────────────────── */

interface DayGroupHeader<TKey extends string> { type: 'day'; key: string; label: string; tag: TKey }
interface DayGroupItem<T, TKey extends string> { type: 'item'; key: string; item: T; tag: TKey }

/**
 * Walk an ordered list of items and yield `{ type: 'day' }` headers between
 * calendar-date boundaries. Used by chat (timestamps + bubbles) and wallet
 * (day-grouped tx feed). Caller decides what to render for each kind.
 *
 *   const feed = groupByDay(transactions, (tx) => tx.created_at, (tx) => tx.id)
 *   feed.flatMap(item => item.type === 'day' ? <DayHeader/> : <Tx/>)
 */
export function groupByDay<T, TKey extends string = 'item'>(
  items: T[],
  getIso: (item: T) => string | null | undefined,
  getKey: (item: T) => string,
  tag: TKey = 'item' as TKey,
): (DayGroupHeader<TKey> | DayGroupItem<T, TKey>)[] {
  const out: (DayGroupHeader<TKey> | DayGroupItem<T, TKey>)[] = []
  let lastDay: string | null = null
  for (const item of items) {
    const iso = getIso(item)
    if (!iso) {
      out.push({ type: 'item', key: getKey(item), item, tag })
      continue
    }
    const day = new Date(iso).toDateString()
    if (day !== lastDay) {
      out.push({ type: 'day', key: `day-${day}-${tag}`, label: formatRelativeDay(iso), tag })
      lastDay = day
    }
    out.push({ type: 'item', key: getKey(item), item, tag })
  }
  return out
}
