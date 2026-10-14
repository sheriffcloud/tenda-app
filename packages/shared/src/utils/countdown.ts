/**
 * Live-countdown formatting for escrow deadlines. Pure + framework-free so it
 * unit-tests without a renderer; the ticking itself lives in useCountdown and
 * the presentation in <DeadlineCountdown/>.
 *
 * We format as a total-hours clock (`H:MM:SS`, e.g. "11:59:58" / "47:03:09")
 * rather than a "tomorrow"/"in 2 days" phrase: a P2P payment window is a
 * same-session, act-now affair, and a live ticking clock conveys that urgency
 * where a calendar phrase buries it.
 */

/** Below this remaining, the countdown reads as WARNING (amber). */
export const COUNTDOWN_WARNING_MS = 2 * 3_600_000
/** Below this remaining, the countdown reads as DANGER (red). */
export const COUNTDOWN_DANGER_MS = 30 * 60_000

export type CountdownTone = 'normal' | 'warning' | 'danger' | 'expired'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Format a remaining duration as a total-hours clock `H:MM:SS`.
 * Negative/zero inputs render "0:00:00" (callers gate on tone === 'expired').
 *   19_384_000 → "5:23:04"   ·   172_798_000 → "47:59:58"   ·   0 → "0:00:00"
 */
export function formatHMS(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${pad2(m)}:${pad2(s)}`
}

/** Map remaining ms to an urgency tone; <=0 is 'expired'. */
export function countdownTone(ms: number): CountdownTone {
  if (ms <= 0) return 'expired'
  if (ms < COUNTDOWN_DANGER_MS) return 'danger'
  if (ms < COUNTDOWN_WARNING_MS) return 'warning'
  return 'normal'
}

/**
 * Compact, static duration label for a FIXED window (not a live countdown) —
 * e.g. an offer's payment window shown on a browse card. Rounds down to whole
 * units; <=0 renders "0m".
 *   43_200 → "12h"   ·   5_400 → "1h 30m"   ·   2_700 → "45m"   ·   0 → "0m"
 */
export function formatDurationShort(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
