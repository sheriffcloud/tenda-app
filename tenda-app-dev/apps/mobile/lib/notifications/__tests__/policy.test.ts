/**
 * Permission-prompt policy. These pure functions decide whether we may ask at
 * all, so the negative branches matter more than the positive ones: a false
 * positive here spends iOS's one-shot system prompt or turns the reminder into
 * nagware.
 */
import {
  INITIAL_PROMPT_STATE,
  MAX_REMINDERS,
  REMINDER_BACKOFF_DAYS,
  JIT_COMMITMENT_THRESHOLD,
  shouldPrimeAtSignup,
  shouldPrimeAfterCommitment,
  shouldShowNudge,
  type NotificationPromptState,
} from '@/lib/notifications/policy'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

function state(overrides: Partial<NotificationPromptState> = {}): NotificationPromptState {
  return { ...INITIAL_PROMPT_STATE, ...overrides }
}

describe('shouldPrimeAtSignup', () => {
  it('primes a fresh install that the OS will still prompt for', () => {
    expect(shouldPrimeAtSignup(state(), true)).toBe(true)
  })

  it('never primes twice', () => {
    expect(shouldPrimeAtSignup(state({ hasPrimedAtSignup: true }), true)).toBe(false)
  })

  it('does not prime when the OS prompt is already spent', () => {
    // Confirming would open a dialog that can never appear: a dead button.
    expect(shouldPrimeAtSignup(state(), false)).toBe(false)
  })
})

describe('shouldPrimeAfterCommitment', () => {
  const committed = state({
    hasPrimedAtSignup: true,
    softDeclinedAt: NOW,
    commitmentCount: JIT_COMMITMENT_THRESHOLD,
  })

  it('re-asks a soft decliner once they commit', () => {
    expect(shouldPrimeAfterCommitment(committed, true)).toBe(true)
  })

  it('does not re-ask a hard denier, Settings is their only route', () => {
    expect(shouldPrimeAfterCommitment(committed, false)).toBe(false)
  })

  it('does not re-ask before the commitment threshold is met', () => {
    expect(shouldPrimeAfterCommitment({ ...committed, commitmentCount: 0 }, true)).toBe(false)
  })

  it('does not re-ask someone who never declined', () => {
    expect(shouldPrimeAfterCommitment({ ...committed, softDeclinedAt: null }, true)).toBe(false)
  })

  it('does not run before the signup primer has been shown', () => {
    expect(shouldPrimeAfterCommitment({ ...committed, hasPrimedAtSignup: false }, true)).toBe(false)
  })
})

describe('shouldShowNudge', () => {
  it('stays silent until the user has declined at least once', () => {
    expect(shouldShowNudge(state(), NOW)).toBe(false)
  })

  it('waits out the first backoff window before the first reminder', () => {
    const declined = state({ softDeclinedAt: NOW })
    const justShy = NOW + REMINDER_BACKOFF_DAYS[0] * DAY - 1

    expect(shouldShowNudge(declined, justShy)).toBe(false)
    expect(shouldShowNudge(declined, NOW + REMINDER_BACKOFF_DAYS[0] * DAY)).toBe(true)
  })

  it('measures later windows from the last reminder, not the decline', () => {
    const shown = state({
      softDeclinedAt: NOW,
      reminderCount: 1,
      lastRemindedAt: NOW + 10 * DAY,
    })

    // 10 days after declining is long past window 0, but window 1 is measured
    // from lastRemindedAt, so it is not yet due.
    expect(shouldShowNudge(shown, NOW + 10 * DAY + REMINDER_BACKOFF_DAYS[1] * DAY - 1)).toBe(false)
    expect(shouldShowNudge(shown, NOW + 10 * DAY + REMINDER_BACKOFF_DAYS[1] * DAY)).toBe(true)
  })

  it('stops permanently once the reminder cap is reached', () => {
    const exhausted = state({
      softDeclinedAt: NOW,
      reminderCount: MAX_REMINDERS,
      lastRemindedAt: NOW,
    })

    expect(shouldShowNudge(exhausted, NOW + 10_000 * DAY)).toBe(false)
  })

  it('never reads past the end of the backoff table', () => {
    const overflowed = state({
      softDeclinedAt: NOW,
      reminderCount: MAX_REMINDERS + 5,
      lastRemindedAt: NOW,
    })

    expect(shouldShowNudge(overflowed, NOW + 10_000 * DAY)).toBe(false)
  })

  it('escalates: each window is longer than the last', () => {
    const windows = [...REMINDER_BACKOFF_DAYS]
    const ascending = windows.every((d, i) => i === 0 || d > windows[i - 1])

    expect(ascending).toBe(true)
  })
})
