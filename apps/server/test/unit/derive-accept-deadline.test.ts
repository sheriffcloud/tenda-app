/**
 * The deadline rule at its BOUNDARY, which the integration suites cannot reach:
 * they can age a draft by a minute or stamp it three days out, but not land it
 * exactly on the quote horizon.
 *
 * The horizon is the whole argument (#41). Reuse anything that outlives a relay
 * quote, because the agent's EIP-3009 create nonce is a hash over the params
 * this instant sits in and the 402 and the payment must agree; redraw anything
 * that does not, because both programs reject a create whose window has closed.
 * "Outlives" has to be STRICT: an instant that expires at exactly the moment a
 * quote could still arrive is not one a signature may be built on.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RELAY_QUOTE_TTL_SECONDS } from '@tenda/shared'
import {
  acceptDeadlineMoved,
  deriveAcceptDeadline,
} from '@server/features/escrows/creation/deriveAcceptDeadline'

const NOW = new Date('2026-08-30T12:00:00.000Z')
const WINDOW = 12 * 60 * 60
const HORIZON_MS = NOW.getTime() + RELAY_QUOTE_TTL_SECONDS * 1000

function draft(accept_deadline: Date | null) {
  return { accept_deadline, accept_window_seconds: WINDOW }
}

test('a stored deadline that outlives the quote horizon is reused, unchanged', () => {
  const stored = new Date(HORIZON_MS + 1)
  const derived = deriveAcceptDeadline(draft(stored), NOW)
  assert.equal(derived.getTime(), stored.getTime(), 'one millisecond past the horizon is enough')
})

test('exactly ON the horizon is redrawn, not reused', () => {
  // The strict comparison. A deadline that expires at the same instant a quote
  // may still land is not something to sign a nonce over.
  const stored = new Date(HORIZON_MS)
  const derived = deriveAcceptDeadline(draft(stored), NOW)
  assert.equal(derived.getTime(), NOW.getTime() + WINDOW * 1000)
  assert.notEqual(derived.getTime(), stored.getTime())
})

test('a lapsed deadline is redrawn from the draft’s own window, not a default', () => {
  const derived = deriveAcceptDeadline(draft(new Date(NOW.getTime() - 1)), NOW)
  assert.equal(derived.getTime(), NOW.getTime() + WINDOW * 1000)
})

test('a null deadline is drawn fresh — a row can predate the column', () => {
  const derived = deriveAcceptDeadline(draft(null), NOW)
  assert.equal(derived.getTime(), NOW.getTime() + WINDOW * 1000)
})

test('the derivation is anchored on the instant passed, never on the wall clock', () => {
  // What lets one request thread ONE `now` through the validator, the insert
  // and the build, so no two of them can disagree by a millisecond.
  const later = new Date(NOW.getTime() + 5_000)
  assert.equal(
    deriveAcceptDeadline(draft(null), later).getTime() - deriveAcceptDeadline(draft(null), NOW).getTime(),
    5_000,
  )
})

test('acceptDeadlineMoved compares by VALUE, and treats a missing instant as moved', () => {
  const derived = new Date(HORIZON_MS + 1)
  assert.equal(acceptDeadlineMoved(null, derived), true, 'the row is missing the fact')
  assert.equal(acceptDeadlineMoved(new Date(derived.getTime()), derived), false, 'equal instants, different objects')
  assert.equal(acceptDeadlineMoved(derived, derived), false)
  assert.equal(acceptDeadlineMoved(new Date(derived.getTime() - 1), derived), true)
})
