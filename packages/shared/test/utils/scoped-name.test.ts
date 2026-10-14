import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopedName } from '../../src/utils/scoped-name'

/**
 * Which of the two names on an exchange party the clients print (#175).
 *
 * The entitlement decision is the server's — `full_name` arrives filled only
 * for a settled party to that escrow. This helper exists so web and mobile
 * cannot reach different conclusions about the same payload, so the cases that
 * matter are the two directions of that switch and the empty edges between.
 */
test('a withheld party reads as the abbreviated label', () => {
  assert.equal(scopedName({ display_name: 'Wisdom A.', full_name: null }), 'Wisdom A.')
})

test('a revealed party reads as the legal name, not the abbreviation', () => {
  const name = scopedName({ display_name: 'Wisdom A.', full_name: 'Wisdom Abioye' })
  assert.equal(name, 'Wisdom Abioye')
})

/**
 * `||`, never `??`. A REVEALED party who never set a profile name carries
 * `full_name: ''` — that is what `formatFullName` answers — and `??` would
 * print the empty string while a real label sat unused beside it.
 */
test('an empty legal name falls through to the label rather than blanking', () => {
  assert.equal(scopedName({ display_name: 'Wisdom A.', full_name: '' }), 'Wisdom A.')
})

/**
 * `''` both ways is the honest answer for a party with no name at all: the word
 * to show instead ("Trader", "Seller", "Anonymous") is per-surface copy, and
 * deciding it here would take that choice away from every caller.
 */
test('a party with no name at all reads as empty, for the caller to name', () => {
  assert.equal(scopedName({ display_name: '', full_name: null }), '')
  assert.equal(scopedName({ display_name: '', full_name: '' }), '')
})
