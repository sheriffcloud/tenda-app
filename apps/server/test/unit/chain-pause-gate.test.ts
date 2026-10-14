/**
 * The server half of the chain pause: refuse the ways IN, keep every way OUT.
 *
 * The classification is the shared takedown table, so this asserts the gate
 * AGREES with it for every action rather than listing four names: an action
 * added to the vocabulary is a compile error in `ACTIONS` until someone decides
 * which side it is on. The HTTP behaviour (creation, accept, apply, funding,
 * and every exit still building) is test/integration/chain-pause.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode, isBlockedByTakedown, type TakedownAction } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertChainNotPaused } from '@server/lib/escrow/chain-pause'

const WAYS_IN = ['create', 'accept', 'assign_accept', 'apply'] as const
const WAYS_OUT = [
  'decline', 'unassign', 'submit', 'approve', 'claim_stalled', 'cancel', 'refund_expired', 'reclaim_abandoned', 'dispute', 'resolve',
] as const
/** Exhaustive over the shared vocabulary: a new action fails to compile until it is placed. */
const ACTIONS: Readonly<Record<TakedownAction, 'in' | 'out'>> = {
  create: 'in', accept: 'in', assign_accept: 'in', apply: 'in',
  decline: 'out', unassign: 'out', submit: 'out', approve: 'out', claim_stalled: 'out', cancel: 'out',
  refund_expired: 'out', reclaim_abandoned: 'out', dispute: 'out', resolve: 'out',
}

const paused = () => ({ paused: true as const })
const enabled = () => ({})

test('every way IN is refused 422 CHAIN_PAUSED on a paused chain', () => {
  for (const action of WAYS_IN) {
    assert.throws(
      () => assertChainNotPaused('eip155:84532', action, paused),
      (err: unknown) => err instanceof AppError && err.statusCode === 422 && err.code === ErrorCode.CHAIN_PAUSED,
      action,
    )
  }
})

test('every way OUT still passes on a paused chain — this is the rule, pinned', () => {
  for (const action of WAYS_OUT) {
    assert.doesNotThrow(() => assertChainNotPaused('eip155:84532', action, paused), action)
  }
})

test('nothing is refused on an enabled chain, in or out', () => {
  for (const action of [...WAYS_IN, ...WAYS_OUT]) {
    assert.doesNotThrow(() => assertChainNotPaused('eip155:84532', action, enabled), action)
  }
})

test('an unknown chain is not this gate\'s to refuse (the registry answers that)', () => {
  for (const action of WAYS_IN) assert.doesNotThrow(() => assertChainNotPaused('eip155:999999', action, () => undefined))
})

test('the gate agrees with the shared takedown table for EVERY action, and the lists above are the table', () => {
  for (const [action, side] of Object.entries(ACTIONS) as Array<[TakedownAction, 'in' | 'out']>) {
    assert.strictEqual(isBlockedByTakedown(action), side === 'in', `${action}: the table moved`)
    const refused = (() => {
      try {
        assertChainNotPaused('x', action, paused)
        return false
      } catch {
        return true
      }
    })()
    assert.strictEqual(refused, side === 'in', `${action}: the gate disagrees with the table`)
  }
  assert.deepStrictEqual(Object.keys(ACTIONS).sort(), [...WAYS_IN, ...WAYS_OUT].sort())
})

test('the real manifest lookup is the default: a live chain is untouched', () => {
  assert.doesNotThrow(() => assertChainNotPaused('solana:devnet', 'create'))
})

test('the message names the chain and points at the picker, and invents no reason', () => {
  try {
    assertChainNotPaused('eip155:84532', 'create', paused)
    assert.fail('expected a refusal')
  } catch (err) {
    assert.ok(err instanceof AppError)
    assert.match(err.message, /eip155:84532/)
    assert.match(err.message, /GET \/v1\/platform\/chains/)
    assert.match(err.message, /Existing escrows on it can still be settled/)
  }
})
