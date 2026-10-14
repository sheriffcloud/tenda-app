/**
 * Pure countdown formatting + urgency-tone mapping (ported from
 * apps/mobile/lib/__tests__/countdown.test.ts when the module moved here).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COUNTDOWN_DANGER_MS,
  COUNTDOWN_WARNING_MS,
  countdownTone,
  formatDurationShort,
  formatHMS,
} from '../../src/utils/countdown'

test('formatHMS: sub-hour zero-pads, zero renders 0:00:00', () => {
  assert.equal(formatHMS(5 * 60_000 + 4_000), '0:05:04')
  assert.equal(formatHMS(0), '0:00:00')
})

test('formatHMS: single-digit hours and total-hours clock (never days)', () => {
  assert.equal(formatHMS(5 * 3_600_000 + 23 * 60_000 + 4_000), '5:23:04')
  assert.equal(formatHMS(47 * 3_600_000 + 59 * 60_000 + 58_000), '47:59:58')
})

test('formatHMS: floors sub-second remainder and clamps negatives', () => {
  assert.equal(formatHMS(1_999), '0:00:01')
  assert.equal(formatHMS(-5_000), '0:00:00')
})

test('countdownTone: expired ≤ 0 < danger < warning < normal bands', () => {
  assert.equal(countdownTone(0), 'expired')
  assert.equal(countdownTone(-1), 'expired')
  assert.equal(countdownTone(COUNTDOWN_DANGER_MS - 1), 'danger')
  assert.equal(countdownTone(60_000), 'danger')
  assert.equal(countdownTone(COUNTDOWN_DANGER_MS), 'warning')
  assert.equal(countdownTone(COUNTDOWN_WARNING_MS - 1), 'warning')
  assert.equal(countdownTone(COUNTDOWN_WARNING_MS), 'normal')
  assert.equal(countdownTone(12 * 3_600_000), 'normal')
})

test('formatDurationShort: whole hours, mixed, minutes-only, floors, clamps', () => {
  assert.equal(formatDurationShort(12 * 3600), '12h')
  assert.equal(formatDurationShort(3600), '1h')
  assert.equal(formatDurationShort(3600 + 30 * 60), '1h 30m')
  assert.equal(formatDurationShort(45 * 60), '45m')
  assert.equal(formatDurationShort(90), '1m')
  assert.equal(formatDurationShort(59), '0m')
  assert.equal(formatDurationShort(-100), '0m')
})
