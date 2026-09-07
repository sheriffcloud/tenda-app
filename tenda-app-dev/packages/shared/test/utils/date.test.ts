import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatConvoTime,
  formatRelativeDay,
  formatRelativeDayWithTime,
  formatRelativeShort,
  groupByDay,
} from '../../src/utils/date'

// Mid-day anchor so hour-offset cases never cross a calendar boundary; the
// runner mocks Date so day-bucket labels are deterministic too.
const NOW = new Date('2026-08-12T15:00:00')
const HOUR = 3_600_000
const DAY = 86_400_000
const ago = (ms: number) => new Date(NOW.getTime() - ms)

test('formatRelativeDay: buckets today, yesterday, weekday, and dates', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.equal(formatRelativeDay(ago(2 * HOUR)), 'Today')
  assert.equal(formatRelativeDay(ago(DAY)), 'Yesterday')
  // 3 days back is inside the weekday window — a day name, not a date.
  assert.match(formatRelativeDay(ago(3 * DAY)), /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/)
  // Same year, past the weekday window: day + short month, no year.
  const sameYear = formatRelativeDay(ago(20 * DAY))
  assert.match(sameYear, /Jul/)
  assert.doesNotMatch(sameYear, /2026/)
  // A previous year keeps the year.
  assert.match(formatRelativeDay(new Date('2025-03-15T12:00:00')), /2025/)
})

test('formatRelativeShort: now → minutes → hours → days → weeks → date', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.equal(formatRelativeShort(ago(30_000)), 'now')
  assert.equal(formatRelativeShort(ago(2 * 60_000)), '2m')
  assert.equal(formatRelativeShort(ago(5 * HOUR)), '5h')
  assert.equal(formatRelativeShort(ago(3 * DAY)), '3d')
  assert.equal(formatRelativeShort(ago(14 * DAY)), '2w')
  assert.match(formatRelativeShort(ago(45 * DAY)), /Jun/)
})

test('formatConvoTime: time-of-day today, day labels older', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.equal(formatConvoTime(ago(30_000)), 'now')
  assert.equal(formatConvoTime(ago(14 * 60_000)), '14m')
  // >1h but still today: a lowercase clock time.
  assert.match(formatConvoTime(ago(3 * HOUR)), /\d{1,2}:\d{2}/)
  assert.equal(formatConvoTime(ago(DAY)), 'Yest')
  assert.match(formatConvoTime(ago(3 * DAY)), /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)
  const sameYear = formatConvoTime(ago(20 * DAY))
  assert.match(sameYear, /Jul/)
  assert.doesNotMatch(sameYear, /2026/)
  assert.match(formatConvoTime(new Date('2025-03-15T12:00:00')), /2025/)
})

test('formatRelativeDayWithTime: day bucket plus lowercase clock time', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const label = formatRelativeDayWithTime(ago(2 * HOUR))
  assert.match(label, /^Today \d{1,2}:\d{2}/)
  assert.equal(label, label.toLowerCase().replace(/^today/, 'Today'))
})

test('groupByDay: inserts one header per calendar day, keyed and tagged', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const items = [
    { id: 'a', at: ago(2 * HOUR).toISOString() },
    { id: 'b', at: ago(3 * HOUR).toISOString() },
    { id: 'c', at: ago(DAY).toISOString() },
  ]
  const out = groupByDay(items, (i) => i.at, (i) => i.id, 'tx')
  assert.deepEqual(out.map((row) => row.type), ['day', 'item', 'item', 'day', 'item'])
  assert.equal(out[0].type === 'day' && out[0].label, 'Today')
  assert.equal(out[3].type === 'day' && out[3].label, 'Yesterday')
  assert.equal(out[1].type === 'item' && out[1].key, 'a')
  assert.equal(out[0].type === 'day' && out[0].tag, 'tx')
})

test('groupByDay: items without a timestamp pass through with no header', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const out = groupByDay([{ id: 'x', at: null as string | null }], (i) => i.at, (i) => i.id)
  assert.deepEqual(out.map((row) => row.type), ['item'])
})
