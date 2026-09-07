/**
 * The completion-window field: what the reader may pick, and what that means
 * in seconds.
 *
 * Both clients had the presets and the arithmetic inline and identically, and
 * both had the same gap — `if (n > 0) onChange(n * 86_400)` with no ceiling,
 * so 91 days produced a value the server refuses and the picker said nothing.
 * It lives here for the reason `gig-budget.ts` does: it is one rule about one
 * field, and a copy in each app is how the two drift apart.
 *
 * The bound is the PRODUCT rail (`MAX_COMPLETION_DURATION_SECONDS`, 90 days),
 * not the protocol one (`ESCROW_LIMITS.maxCompletionDurationSeconds`, 180
 * days): a picker should offer the tighter of the two.
 *
 * SERVER-ENFORCED since #52, which is what this paragraph used to deny. `POST
 * /v1/escrows` had checked only that `completion_duration_seconds` was a
 * positive integer, so the rail was advisory — what the composer declined to
 * submit, not what the API declined to accept. It now runs the same
 * `isValidCompletionDuration` the pickers use
 * (features/escrows/creation/validateCreateEscrow.ts), so client and API agree
 * on one number and an over-limit value is a 422 rather than a chain revert
 * after the user has signed.
 *
 * The consequence to know: moving this rail is now a SERVER deploy, not a
 * client-only one.
 */
import { formatDuration } from './gig-display'
import {
  MAX_COMPLETION_DURATION_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  isValidCompletionDuration,
} from './validation'

export type DurationUnit = 'hours' | 'days'

/** Seconds in one of each unit — the multiplier both clients wrote inline. */
export const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
  hours: 60 * 60,
  days: 60 * 60 * 24,
}

/** The chips, shortest first. Every one is inside the legal window. */
export const DURATION_PRESETS: readonly { label: string; seconds: number }[] = [
  { label: '1d', seconds: 1 * DURATION_UNIT_SECONDS.days },
  { label: '3d', seconds: 3 * DURATION_UNIT_SECONDS.days },
  { label: '7d', seconds: 7 * DURATION_UNIT_SECONDS.days },
  { label: '14d', seconds: 14 * DURATION_UNIT_SECONDS.days },
  { label: '30d', seconds: 30 * DURATION_UNIT_SECONDS.days },
]

/**
 * A typed custom amount in seconds, or null when there is no number yet.
 *
 * Deliberately does NOT clamp: an over-limit window is returned exactly as
 * typed so the reader is told what is wrong with the number they entered,
 * rather than watching it silently become a different number. Same rule the
 * budget field follows.
 */
export function customDurationToSeconds(typed: string, unit: DurationUnit): number | null {
  // parseInt would accept '12abc' and, worse, '1e5'; the field is a plain
  // count of hours or days and nothing else.
  if (!/^\d+$/.test(typed.trim())) return null
  const amount = Number(typed.trim())
  if (amount <= 0) return null
  return amount * DURATION_UNIT_SECONDS[unit]
}

/** The window as the reader would read it, e.g. "1 hour to 90 days". */
export function durationRangeLabel(): string {
  return `${formatDuration(MIN_COMPLETION_DURATION_SECONDS)} to ${formatDuration(MAX_COMPLETION_DURATION_SECONDS)}`
}

/**
 * What is wrong with a completion window, or null when nothing is.
 *
 * Separates "not set" from "outside the window" — the distinction the wizard
 * could not previously make, so both read "Set a delivery time" and a reader
 * who had typed 91 days was told to enter something they had just entered.
 */
export function completionDurationProblem(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Set a delivery time'
  if (!isValidCompletionDuration(seconds)) return `Delivery time must be ${durationRangeLabel()}`
  return null
}
