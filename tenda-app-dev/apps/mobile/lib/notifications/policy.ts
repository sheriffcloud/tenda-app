/**
 * Notification-prompt policy: the constants and pure decision functions that
 * govern when we may ask for permission.
 *
 * These are deliberately free of React and of the SDK so every branch is unit
 * testable, the hooks and components below only wire them to state.
 *
 * The governing constraint is that iOS shows the system permission dialog
 * exactly once per install. Every "ask" therefore has to be spent behind an
 * explicit user tap on our own primer, never fired automatically.
 */

/** Android default channel, created before any token request. */
export const ANDROID_CHANNEL = {
  id: 'default',
  name: 'Default',
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#3b82f6',
} as const

/**
 * Escalating quiet period, in days, before the nudge banner may reappear.
 * Index n is the wait before reminder n+1, so the list length is the cap.
 */
export const REMINDER_BACKOFF_DAYS = [3, 14, 45] as const

/** Total nudges allowed after the first soft decline. */
export const MAX_REMINDERS = REMINDER_BACKOFF_DAYS.length

/**
 * Commitment actions (funding a gig, accepting one) a user may complete with
 * notifications off before the just-in-time re-ask fires. One is enough, the
 * first commitment is exactly the moment the value becomes self-evident.
 */
export const JIT_COMMITMENT_THRESHOLD = 1

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Persisted prompt bookkeeping. Device scoped, permission is a device fact. */
export interface NotificationPromptState {
  /** Epoch ms of the last "Not now" tap, null if never soft declined. */
  softDeclinedAt: number | null
  /** Nudge banners surfaced since the soft decline. */
  reminderCount: number
  /** Epoch ms the nudge banner was last surfaced. */
  lastRemindedAt: number | null
  /** True once the post-signup primer has been shown, so it never repeats. */
  hasPrimedAtSignup: boolean
  /** Commitment actions completed while notifications were off. */
  commitmentCount: number
}

export const INITIAL_PROMPT_STATE: NotificationPromptState = {
  softDeclinedAt: null,
  reminderCount: 0,
  lastRemindedAt: null,
  hasPrimedAtSignup: false,
  commitmentCount: 0,
}

/**
 * Tier 1, the post-signup primer. Shown once, and only while the OS would
 * still honour a prompt, priming a user we can no longer ask would dead-end on
 * a button that opens nothing.
 */
export function shouldPrimeAtSignup(
  state: NotificationPromptState,
  canAskAgain: boolean,
): boolean {
  return !state.hasPrimedAtSignup && canAskAgain
}

/**
 * Tier 2, the just-in-time re-ask after the user's first real commitment.
 * Reserved for people who tapped "Not now" (the OS prompt is still unspent),
 * never for people who saw the system dialog and denied, for whom `canAskAgain`
 * is false and Settings is the only route.
 */
export function shouldPrimeAfterCommitment(
  state: NotificationPromptState,
  canAskAgain: boolean,
): boolean {
  return (
    canAskAgain &&
    state.hasPrimedAtSignup &&
    state.softDeclinedAt !== null &&
    state.commitmentCount >= JIT_COMMITMENT_THRESHOLD
  )
}

/**
 * Tier 3, the throttled nudge banner, the long tail for both soft decliners
 * and hard deniers (the latter are routed to Settings rather than a prompt).
 * Silent until the user has declined once, then escalating backoff up to a cap.
 */
export function shouldShowNudge(state: NotificationPromptState, now: number): boolean {
  if (state.softDeclinedAt === null) return false
  if (state.reminderCount >= MAX_REMINDERS) return false

  // The cap above is REMINDER_BACKOFF_DAYS.length, so the index is always in
  // range here, no undefined guard needed.
  const waitDays = REMINDER_BACKOFF_DAYS[state.reminderCount]
  const since = state.lastRemindedAt ?? state.softDeclinedAt
  return now - since >= waitDays * MS_PER_DAY
}
