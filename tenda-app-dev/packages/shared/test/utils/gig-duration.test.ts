import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DURATION_PRESETS,
  DURATION_UNIT_SECONDS,
  completionDurationProblem,
  customDurationToSeconds,
  durationRangeLabel,
} from '../../src/utils/gig-duration'
import {
  MAX_COMPLETION_DURATION_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  isValidCompletionDuration,
} from '../../src/utils/validation'

// ---------- the presets --------------------------------------------------

test('every preset is inside the window the server enforces', () => {
  // The invariant that keeps a chip from being unpostable. Checked against the
  // validator rather than against the numbers, so adding a preset is checked
  // by construction.
  assert.ok(DURATION_PRESETS.length > 0)
  for (const preset of DURATION_PRESETS) {
    assert.equal(isValidCompletionDuration(preset.seconds), true, preset.label)
  }
})

test('presets are ordered shortest first and are duplicate-free', () => {
  const seconds = DURATION_PRESETS.map((p) => p.seconds)
  assert.deepEqual(seconds, [...seconds].sort((a, b) => a - b))
  assert.equal(new Set(seconds).size, seconds.length)
})

// ---------- the boundary -------------------------------------------------

test('exactly the minimum and exactly the maximum are legal', () => {
  assert.equal(completionDurationProblem(MIN_COMPLETION_DURATION_SECONDS), null)
  assert.equal(completionDurationProblem(MAX_COMPLETION_DURATION_SECONDS), null)
  // Stated in the units the picker offers, so the boundary is legible: 1 hour
  // and 90 days.
  assert.equal(MIN_COMPLETION_DURATION_SECONDS, DURATION_UNIT_SECONDS.hours)
  assert.equal(MAX_COMPLETION_DURATION_SECONDS, 90 * DURATION_UNIT_SECONDS.days)
})

test('one unit either side of the window is refused, and named', () => {
  const under = customDurationToSeconds('59', 'hours')
  const over = customDurationToSeconds('91', 'days')

  assert.equal(completionDurationProblem(MIN_COMPLETION_DURATION_SECONDS - 1), `Delivery time must be ${durationRangeLabel()}`)
  assert.equal(completionDurationProblem(MAX_COMPLETION_DURATION_SECONDS + 1), `Delivery time must be ${durationRangeLabel()}`)
  // 91 days is the case the picker used to accept silently.
  assert.notEqual(over, null)
  assert.equal(completionDurationProblem(over as number), `Delivery time must be ${durationRangeLabel()}`)
  // 59 hours is inside the window; the near-miss is at 59 MINUTES, which the
  // field cannot express — the smallest unit it offers is an hour.
  assert.equal(completionDurationProblem(under as number), null)
})

test('the range label names both ends, in the units the chips use', () => {
  assert.equal(durationRangeLabel(), '1h to 90d')
})

// ---------- "not set" is not "out of range" ------------------------------

test('an unset window asks for one; an illegal window says what is legal', () => {
  // The distinction the wizard could not make: both used to read "Set a
  // delivery time", so a reader who had just typed 91 days was told to enter
  // something they had entered.
  assert.equal(completionDurationProblem(0), 'Set a delivery time')
  assert.notEqual(completionDurationProblem(MAX_COMPLETION_DURATION_SECONDS + 1), 'Set a delivery time')
})

test('a negative or non-finite window is unset, not out of range', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(completionDurationProblem(value), 'Set a delivery time')
  }
})

// ---------- what the custom field accepts --------------------------------

test('converts a typed count by its unit', () => {
  assert.equal(customDurationToSeconds('3', 'days'), 3 * DURATION_UNIT_SECONDS.days)
  assert.equal(customDurationToSeconds('12', 'hours'), 12 * DURATION_UNIT_SECONDS.hours)
  assert.equal(customDurationToSeconds(' 7 ', 'days'), 7 * DURATION_UNIT_SECONDS.days)
})

test('anything that is not a plain positive count is NO duration', () => {
  // parseInt accepted every one of these: '12abc' became 12, and '1e5' became
  // 1 — a hundred-thousand-day window silently entered as one day.
  for (const typed of ['', '0', '-3', '1.5', '1e5', '12abc', 'abc', ' ', '+4']) {
    assert.equal(customDurationToSeconds(typed, 'days'), null, typed)
  }
})

test('an over-limit entry converts rather than clamping', () => {
  // Deliberate: the reader is told what is wrong with the number they typed,
  // instead of watching it become a different number. Same rule as the budget.
  assert.equal(customDurationToSeconds('91', 'days'), 91 * DURATION_UNIT_SECONDS.days)
  assert.notEqual(customDurationToSeconds('91', 'days'), MAX_COMPLETION_DURATION_SECONDS)
})
