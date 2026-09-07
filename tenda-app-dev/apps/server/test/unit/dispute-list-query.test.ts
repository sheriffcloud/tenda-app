/**
 * Filter narrowing for the admin dispute queue.
 *
 * The behaviour under test is the FAIL-CLOSED one: before this, an
 * unrecognised value fell through the `if` that consumed it and the query ran
 * unfiltered, so a typo returned the whole queue — resolved disputes included
 * — while the dashboard still showed the filter as applied.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { DISPUTE_LIST_ASSIGNED, DISPUTE_LIST_STATUSES } from '@tenda/shared'
import { escrowKindEnum } from '@tenda/shared/db/schema/escrow'
import { AppError } from '@server/lib/errors'
import {
  narrowDisputeAssigned,
  narrowDisputeKind,
  narrowDisputeParty,
  narrowDisputeStatus,
} from '@server/lib/disputes/list-query'

/** Every narrower, paired with the vocabulary it is supposed to enforce. */
const FILTERS = [
  { field: 'status', narrow: narrowDisputeStatus, allowed: DISPUTE_LIST_STATUSES },
  { field: 'kind', narrow: narrowDisputeKind, allowed: escrowKindEnum.enumValues },
  { field: 'assigned', narrow: narrowDisputeAssigned, allowed: DISPUTE_LIST_ASSIGNED },
] as const

test('every legal value round-trips unchanged', () => {
  // Driven off the vocabularies themselves: adding a value to one of them
  // without teaching the narrower about it fails here, rather than shipping a
  // filter the API refuses.
  for (const { field, narrow, allowed } of FILTERS) {
    for (const value of allowed) {
      assert.strictEqual(narrow(value), value, `${field}=${value} should be accepted`)
    }
  }
})

test('absent and empty both mean "no filter", never a rejection', () => {
  // Empty is a CLEARED filter, not a typo — the same rule the route's `party`
  // filter follows. Rejecting it would break any UI that serialises an unset
  // dropdown as `?status=`.
  for (const { field, narrow } of FILTERS) {
    assert.strictEqual(narrow(undefined), undefined, `${field} absent`)
    assert.strictEqual(narrow(''), undefined, `${field} empty`)
  }
})

test('an unrecognised value is a 400 that NAMES the field and the legal values', () => {
  for (const { field, narrow, allowed } of FILTERS) {
    assert.throws(
      () => narrow('banana'),
      (err: unknown) => {
        assert.ok(err instanceof AppError, `${field} should throw AppError`)
        assert.strictEqual(err.statusCode, 400)
        assert.strictEqual(err.code, 'VALIDATION_ERROR')
        // Naming the field matters: three filters share one message shape, and
        // "must be one of: open, resolved" alone does not say which is wrong.
        assert.ok(err.message.startsWith(`${field} must be one of:`), err.message)
        for (const value of allowed) assert.ok(err.message.includes(value), err.message)
        return true
      },
      `${field}=banana should be refused`,
    )
  }
})

test('near-misses are refused too — case and whitespace are not normalised', () => {
  // An internal API with one fixed client: silently accepting 'OPEN' would
  // invite callers to depend on coercion this never promised.
  assert.throws(() => narrowDisputeStatus('OPEN'), AppError)
  assert.throws(() => narrowDisputeStatus(' open'), AppError)
  assert.throws(() => narrowDisputeKind('Gig'), AppError)
  assert.throws(() => narrowDisputeAssigned('ME'), AppError)
})

test('one filter’s vocabulary is not accepted by another', () => {
  // They share a helper, so a mis-wired `allowed` argument would still narrow
  // "successfully" — just against the wrong list.
  assert.throws(() => narrowDisputeStatus('me'), AppError)
  assert.throws(() => narrowDisputeKind('open'), AppError)
  assert.throws(() => narrowDisputeAssigned('gig'), AppError)
})

// ─── party ───────────────────────────────────────────────────────────────────
// No vocabulary to check against — a user id is shape-checked instead.

test('party: a well-formed uuid passes through untouched, in either case', () => {
  const lower = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
  assert.strictEqual(narrowDisputeParty(lower), lower)
  // Postgres compares uuids by value, so upper case is the SAME id — rejecting
  // it would refuse a filter that works perfectly well.
  assert.strictEqual(narrowDisputeParty(lower.toUpperCase()), lower.toUpperCase())
})

test('party: absent and empty mean "no filter", matching the enum narrowers', () => {
  assert.strictEqual(narrowDisputeParty(undefined), undefined)
  assert.strictEqual(narrowDisputeParty(''), undefined)
})

test('party: a malformed id is a 400, NOT the 500 postgres used to throw', () => {
  // Unchecked, this reached the driver as a uuid comparison and threw
  // `invalid input syntax for type uuid` — the caller was told the server is
  // broken when their input was the problem.
  for (const bad of ['banana', '3f2504e0', '3f2504e0-4f89-11d3-9a0c-0305e82c33012', 'not-a-uuid-at-all-really!!']) {
    assert.throws(
      () => narrowDisputeParty(bad),
      (err: unknown) => {
        assert.ok(err instanceof AppError)
        assert.strictEqual(err.statusCode, 400)
        assert.strictEqual(err.code, 'VALIDATION_ERROR')
        assert.ok(err.message.startsWith('party must be'), err.message)
        return true
      },
      `party=${bad} should be refused`,
    )
  }
})

test('party: a valid uuid is NOT rejected just because it names nobody', () => {
  // Shape only. "No such user" is an empty result page, not a 400 — the route
  // must still run the query.
  const nobody = '00000000-0000-0000-0000-000000000000'
  assert.strictEqual(narrowDisputeParty(nobody), nobody)
})
