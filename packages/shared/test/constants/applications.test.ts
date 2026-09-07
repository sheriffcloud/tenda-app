import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  ACTIVE_APPLICATION_STATUSES,
} from '../../src/constants/applications'

/**
 * The guard that decides whether an inbound value is a real application status.
 * It matters more than a type guard usually does: the status is read straight
 * out as user-facing copy on both sides (mobile gig-applications/copy.ts), so
 * letting an unknown one through renders it verbatim to a worker.
 */
test('isApplicationStatus accepts every declared status', () => {
  assert.ok(APPLICATION_STATUSES.length >= 6, 'expected the full status set')
  for (const status of APPLICATION_STATUSES) {
    assert.equal(isApplicationStatus(status), true, status)
  }
})

test('isApplicationStatus rejects near-misses and other statuses', () => {
  // Escrow statuses share the vocabulary, and are NOT application statuses.
  for (const bad of ['', 'Open', 'OPEN', 'accepted', 'completed', 'pending', 'withdrawn ']) {
    assert.equal(isApplicationStatus(bad), false, `expected ${JSON.stringify(bad)} rejected`)
  }
})

test('isApplicationStatus rejects non-strings without throwing', () => {
  for (const bad of [null, undefined, 0, 1, {}, [], ['open'], true, Symbol('open')]) {
    assert.equal(isApplicationStatus(bad), false, `expected ${String(bad)} rejected`)
  }
})

test('ACTIVE_APPLICATION_STATUSES is a subset of the declared statuses', () => {
  assert.ok(ACTIVE_APPLICATION_STATUSES.length > 0)
  for (const status of ACTIVE_APPLICATION_STATUSES) {
    assert.ok(isApplicationStatus(status), `${status} is active but not a declared status`)
  }
})
