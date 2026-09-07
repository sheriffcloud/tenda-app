/**
 * Gig status/deadline display rules — moved from mobile, first tests written
 * at the move (mobile had none). Deadline branches run under mocked Date.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESCROW_STATUS_ORDER } from '../../src/constants/escrow'
import {
  PLACE_UNKNOWN,
  deadlineLabel,
  formatDate,
  gigPlaceLabel,
  formatDeadline,
  formatDuration,
  gigDeadlineMeta,
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
} from '../../src/utils/gig-display'

const NOW = new Date('2026-08-12T15:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)
const HOUR = 3_600_000

test('STATUS_LABEL and STATUS_BADGE_VARIANT cover every escrow status plus draft', () => {
  for (const status of [...ESCROW_STATUS_ORDER, 'draft'] as const) {
    assert.notEqual(STATUS_LABEL[status], undefined, status)
    assert.notEqual(STATUS_BADGE_VARIANT[status], undefined, status)
  }
})

test('deadlineLabel: expired, urgent hours, tomorrow, days out', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.equal(deadlineLabel(null), '')
  assert.equal(deadlineLabel(at(-1_000)), 'Expired')
  assert.equal(deadlineLabel(at(4 * HOUR)), '4h left')
  assert.equal(deadlineLabel(at(45 * 60_000)), '45m left')
  assert.equal(deadlineLabel(at(30 * HOUR)), 'Tomorrow')
  assert.equal(deadlineLabel(at(3 * 24 * HOUR + HOUR)), '3 days left')
})

test('gigDeadlineMeta: non-countdown statuses', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.deepEqual(gigDeadlineMeta({ status: 'draft', accept_deadline: null }), {
    label: 'Draft',
    glyph: 'clock',
    tone: 'neutral',
  })
  assert.deepEqual(gigDeadlineMeta({ status: 'refunded', accept_deadline: null }), {
    label: 'Refunded',
    glyph: 'clock',
    tone: 'neutral',
  })
  assert.deepEqual(gigDeadlineMeta({ status: 'cancelled', accept_deadline: null }), {
    label: 'Cancelled',
    glyph: null,
    tone: 'neutral',
  })
  assert.deepEqual(gigDeadlineMeta({ status: 'disputed', accept_deadline: null }), {
    label: 'Support open',
    glyph: 'clock',
    tone: 'neutral',
  })
})

test('gigDeadlineMeta: completed/resolved show relative past with check glyph', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  const done = gigDeadlineMeta({
    status: 'completed',
    accept_deadline: null,
    updated_at: at(-3 * 24 * HOUR).toISOString(),
  })
  assert.deepEqual(done, { label: '3d', glyph: 'check', tone: 'success' })
  const noStamp = gigDeadlineMeta({ status: 'resolved', accept_deadline: null })
  assert.deepEqual(noStamp, { label: '', glyph: 'check', tone: 'success' })
})

test('gigDeadlineMeta: open — countdown, urgency, expiry, and missing deadline', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.deepEqual(gigDeadlineMeta({ status: 'open', accept_deadline: null }), {
    label: '',
    glyph: null,
    tone: 'neutral',
  })
  assert.deepEqual(gigDeadlineMeta({ status: 'open', accept_deadline: at(-1_000).toISOString() }), {
    label: 'Expired',
    glyph: 'clock',
    tone: 'neutral',
  })
  assert.deepEqual(gigDeadlineMeta({ status: 'open', accept_deadline: at(4 * HOUR).toISOString() }), {
    label: '4h left',
    glyph: 'clock',
    tone: 'neutral',
  })
  // Under URGENT_HOURS (2h) flips the tone.
  assert.deepEqual(gigDeadlineMeta({ status: 'open', accept_deadline: at(45 * 60_000).toISOString() }), {
    label: '45m left',
    glyph: 'clock',
    tone: 'urgent',
  })
})

test('gigDeadlineMeta: accepted and submitted windows, including overdue', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.deepEqual(
    gigDeadlineMeta({
      status: 'accepted',
      accept_deadline: null,
      completion_deadline: at(90 * 60_000).toISOString(),
    }),
    { label: '1h 30m', glyph: 'clock', tone: 'urgent' },
  )
  assert.deepEqual(
    gigDeadlineMeta({ status: 'accepted', accept_deadline: null, completion_deadline: at(-1_000).toISOString() }),
    { label: 'Overdue', glyph: 'clock', tone: 'urgent' },
  )
  assert.deepEqual(
    gigDeadlineMeta({ status: 'accepted', accept_deadline: null }),
    { label: '', glyph: null, tone: 'neutral' },
  )
  // Multi-day window exercises formatCountdown's days tail.
  assert.deepEqual(
    gigDeadlineMeta({
      status: 'accepted',
      accept_deadline: null,
      completion_deadline: at(3 * 24 * HOUR + HOUR).toISOString(),
    }),
    { label: '3d', glyph: 'clock', tone: 'neutral' },
  )
  assert.deepEqual(
    gigDeadlineMeta({
      status: 'submitted',
      accept_deadline: null,
      approval_deadline: at(22 * HOUR).toISOString(),
    }),
    { label: '22h to review', glyph: 'clock', tone: 'neutral' },
  )
  assert.deepEqual(
    gigDeadlineMeta({ status: 'submitted', accept_deadline: null, approval_deadline: at(-1_000).toISOString() }),
    { label: 'Review overdue', glyph: 'clock', tone: 'urgent' },
  )
  assert.deepEqual(
    gigDeadlineMeta({ status: 'submitted', accept_deadline: null }),
    { label: '', glyph: null, tone: 'neutral' },
  )
})

test('formatDuration: minutes, hours, days', () => {
  assert.equal(formatDuration(90), '2m')
  assert.equal(formatDuration(3600), '1h')
  assert.equal(formatDuration(86_400), '1d')
})

test('formatDate / formatDeadline: empty for null, formatted otherwise', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW })
  assert.equal(formatDate(null), '')
  assert.equal(formatDeadline(undefined), '')
  assert.match(formatDate('2026-08-01T10:00:00.000Z'), /Aug/)
  // Under 24h away includes a time component; far out does not.
  assert.match(formatDeadline(at(3 * HOUR)), /\d{1,2}:\d{2}/)
  assert.doesNotMatch(formatDeadline(at(72 * HOUR)), /\d{1,2}:\d{2}/)
})

test('gigPlaceLabel: remote wins — a remote gig persists no city or country', () => {
  assert.equal(gigPlaceLabel({ remote: true, city: null, country: null }), 'Remote')
  // Even if stale fields survive on the row, the arrangement is the answer.
  assert.equal(gigPlaceLabel({ remote: true, city: 'Lagos', country: 'NG' }), 'Remote')
})

test('gigPlaceLabel: resolves the country CODE to its name', () => {
  assert.equal(gigPlaceLabel({ remote: false, city: 'Lagos', country: 'NG' }), 'Lagos, Nigeria')
  assert.equal(gigPlaceLabel({ remote: false, city: null, country: 'KE' }), 'Kenya')
})

test('gigPlaceLabel: an unknown code is shown as-is rather than dropped', () => {
  assert.equal(gigPlaceLabel({ remote: false, city: 'Springfield', country: 'ZZ' }), 'Springfield, ZZ')
})

test('gigPlaceLabel: no location at all is unknown, never "Anywhere"', () => {
  assert.equal(gigPlaceLabel({ remote: false, city: null, country: null }), PLACE_UNKNOWN)
  assert.equal(gigPlaceLabel({ remote: false, city: '', country: '' }), PLACE_UNKNOWN)
})

test('gigPlaceLabel: city alone is enough', () => {
  assert.equal(gigPlaceLabel({ remote: false, city: 'Accra', country: null }), 'Accra')
})

test('gigDeadlineMeta: a status this build does not know yields a neutral, chip-less meta', () => {
  // Reachable: `status` is whatever the server sent, and an installed client
  // outlives the vocabulary it was built with. The switch used to fall through
  // and return `undefined`, so every caller threw on `.label` — which in a list
  // row is a blank screen, not a missing chip. The compile-time exhaustiveness
  // check is kept by the `never` binding in that arm, so adding a status to
  // EscrowStatus still fails the build until it is handled.
  const meta = gigDeadlineMeta({
    status: 'archived' as (typeof ESCROW_STATUS_ORDER)[number],
    accept_deadline: null,
  })

  assert.deepEqual(meta, { label: '', glyph: null, tone: 'neutral' })
})

test('gigDeadlineMeta: reading .label off an unknown status does not throw', () => {
  // The failure mode as the caller meets it, not as the function returns it.
  assert.doesNotThrow(() => {
    const meta = gigDeadlineMeta({
      status: 'archived' as (typeof ESCROW_STATUS_ORDER)[number],
      accept_deadline: null,
    })
    return meta.label.length
  })
})
