/**
 * Pure countdown formatting + urgency-tone mapping. The ticking lives in
 * useCountdown; here we pin the format (total-hours H:MM:SS) and the tone bands.
 */
import {
  formatHMS,
  countdownTone,
  formatDurationShort,
  COUNTDOWN_WARNING_MS,
  COUNTDOWN_DANGER_MS,
} from '../countdown'

describe('formatHMS', () => {
  test('sub-hour: zero-pads minutes and seconds', () => {
    expect(formatHMS(5 * 60_000 + 4_000)).toBe('0:05:04')
    expect(formatHMS(0)).toBe('0:00:00')
  })

  test('single-digit hours', () => {
    expect(formatHMS(5 * 3_600_000 + 23 * 60_000 + 4_000)).toBe('5:23:04')
  })

  test('total-hours clock never rolls into days', () => {
    // 47h 59m 58s stays "47:59:58", not "1d …"
    expect(formatHMS(47 * 3_600_000 + 59 * 60_000 + 58_000)).toBe('47:59:58')
  })

  test('truncates sub-second remainder (floors)', () => {
    expect(formatHMS(1_999)).toBe('0:00:01')
  })

  test('clamps negatives to zero', () => {
    expect(formatHMS(-5_000)).toBe('0:00:00')
  })
})

describe('countdownTone', () => {
  test('expired at or below zero', () => {
    expect(countdownTone(0)).toBe('expired')
    expect(countdownTone(-1)).toBe('expired')
  })

  test('danger under 30 minutes', () => {
    expect(countdownTone(COUNTDOWN_DANGER_MS - 1)).toBe('danger')
    expect(countdownTone(60_000)).toBe('danger')
  })

  test('warning between 30 minutes and 2 hours', () => {
    expect(countdownTone(COUNTDOWN_DANGER_MS)).toBe('warning')
    expect(countdownTone(COUNTDOWN_WARNING_MS - 1)).toBe('warning')
  })

  test('normal at or above 2 hours', () => {
    expect(countdownTone(COUNTDOWN_WARNING_MS)).toBe('normal')
    expect(countdownTone(12 * 3_600_000)).toBe('normal')
  })
})

describe('formatDurationShort', () => {
  test('whole hours drop the minutes', () => {
    expect(formatDurationShort(12 * 3600)).toBe('12h')
    expect(formatDurationShort(3600)).toBe('1h')
  })

  test('hours + minutes', () => {
    expect(formatDurationShort(3600 + 30 * 60)).toBe('1h 30m')
  })

  test('sub-hour renders minutes only', () => {
    expect(formatDurationShort(45 * 60)).toBe('45m')
  })

  test('floors partial minutes', () => {
    expect(formatDurationShort(90)).toBe('1m')
    expect(formatDurationShort(59)).toBe('0m')
  })

  test('clamps negatives to 0m', () => {
    expect(formatDurationShort(-100)).toBe('0m')
  })
})
