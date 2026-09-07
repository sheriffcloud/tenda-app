/**
 * lib/escrow-events — the event→DB application table. Every event maps to
 * its status guard, tx type, derived columns and actor; replays absorb via
 * the guard.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  EVENT_APPLICATIONS,
  INTERNAL_EVENT_BY_WIRE,
  applyEscrowEvent,
  type ApplyEscrowEventDeps,
  type EscrowEventStore,
  type EscrowPatch,
} from '@server/lib/escrow-events'
import {
  ESCROW_EVENTS,
  EVENT_BY_TX_TYPE,
  type DecodedEvent,
  type EscrowEvent,
} from '@server/chains/types'
import type { EscrowStatus } from '@server/lib/escrow'
import { TEST_ESCROW_PROGRAM } from '../helpers/fixtures'

const ESCROW_ID = '11111111-2222-4333-8444-555555555555'
const TX_REF = 'sig-1'

interface Recorded {
  transitions: Array<{
    escrow_id: string
    from: EscrowStatus[]
    patch: EscrowPatch
    /** Present only when the event declared `reverts_application_cycle`. */
    revertApplications: { now: Date } | undefined
  }>
  transactions: Array<{
    escrow_id: string
    type: string
    tx_ref: string
    amount_raw: string | null
    platform_fee_raw: string | null
    creator_payout_raw: string | null
    actor_id: string | null
  }>
  resolutions: Array<{ escrow_id: string; winner: string }>
}

function makeDeps(opts: { guardTrips?: boolean; wallets?: Record<string, string> } = {}): {
  deps: ApplyEscrowEventDeps
  rec: Recorded
} {
  const rec: Recorded = { transitions: [], transactions: [], resolutions: [] }
  const store: EscrowEventStore = {
    // Mirrors the real store's atomicity: the audit row + dispute stamp are
    // written only when the status guard passes, all in one applyEvent call.
    async applyEvent({ escrow_id, from, patch, transaction, disputeResolution, revertApplications }) {
      rec.transitions.push({ escrow_id, from, patch, revertApplications })
      if (opts.guardTrips ?? false) return { applied: false, passed_applicant_ids: [], revived_applicant_ids: [] }
      rec.transactions.push({ escrow_id, ...transaction })
      if (disputeResolution !== undefined) {
        rec.resolutions.push({ escrow_id, winner: disputeResolution.winner })
      }
      return { applied: true, passed_applicant_ids: [], revived_applicant_ids: [] }
    },
    async resolveUserByWallet(_ns, address) {
      return opts.wallets?.[address] ?? null
    },
  }
  return { deps: { store, chain_ns: 'solana' }, rec }
}

function event(name: EscrowEvent, fields: Record<string, string>): DecodedEvent {
  return {
    name,
    escrow_ref: 'EscrowPda111',
    contract: TEST_ESCROW_PROGRAM,
    fields: { escrow_id: ESCROW_ID, ...fields },
  }
}

test('table covers every wire event with an internal name', () => {
  for (const name of ESCROW_EVENTS) {
    assert.ok(EVENT_APPLICATIONS[name], `missing application for ${name}`)
    assert.ok(INTERNAL_EVENT_BY_WIRE[name].startsWith('escrow.'))
  }
})

test('EscrowCreated: draft→open, stamps escrow_ref, records create with amount + creator actor', async () => {
  const { deps, rec } = makeDeps({ wallets: { Creator111: 'user-creator' } })
  const r = await applyEscrowEvent(
    deps,
    event('EscrowCreated', { amount: '1000', creator: 'Creator111' }),
    TX_REF,
  )
  assert.deepStrictEqual(r, {
    applied: true,
    escrow_id: ESCROW_ID,
    internal_event: 'escrow.created',
    // Create installs no counterparty.
    counterparty_id: null,
    // Nothing to auto-resolve: applications belong to the assign path.
    passed_applicant_ids: [],
    // Nothing to revive either: only an unassign reverses a cycle.
    revived_applicant_ids: [],
  })
  assert.deepStrictEqual(rec.transitions[0].from, ['draft'])
  assert.strictEqual(rec.transitions[0].patch.status, 'open')
  assert.strictEqual(rec.transitions[0].patch.escrow_ref, 'EscrowPda111')
  assert.deepStrictEqual(rec.transactions[0], {
    escrow_id: ESCROW_ID,
    type: 'create',
    tx_ref: TX_REF,
    amount_raw: '1000',
    platform_fee_raw: null,
    creator_payout_raw: null,
    actor_id: 'user-creator',
  })
})

test('EscrowAccepted: open→accepted, resolves counterparty wallet, sets completion_deadline', async () => {
  const { deps, rec } = makeDeps({ wallets: { Cp111: 'user-cp' } })
  await applyEscrowEvent(
    deps,
    event('EscrowAccepted', { counterparty: 'Cp111', completion_deadline: '1900007200' }),
    TX_REF,
  )
  const patch = rec.transitions[0].patch
  assert.strictEqual(patch.status, 'accepted')
  assert.strictEqual(patch.counterparty_id, 'user-cp')
  assert.strictEqual(patch.completion_deadline?.getTime(), 1_900_007_200_000)
})

test('signer addresses: create stamps the creator (and the Solana-attested assignee, when carried)', async () => {
  // The wallet that ACTUALLY signed, from the event — feeds my_signer_address.
  const { deps, rec } = makeDeps({ wallets: { Creator111: 'user-creator' } })
  await applyEscrowEvent(
    deps,
    event('EscrowCreated', { amount: '1000', creator: 'Creator111', assigned_counterparty: 'Asgn111' }),
    TX_REF,
  )
  assert.strictEqual(rec.transitions[0].patch.creator_address, 'Creator111')
  assert.strictEqual(rec.transitions[0].patch.assigned_counterparty_address, 'Asgn111')

  // The EVM create event carries no assignee: the route's build-time stamp
  // must STAND, so the patch omits the key rather than nulling it.
  const bare = makeDeps({ wallets: { Creator111: 'user-creator' } })
  await applyEscrowEvent(
    bare.deps,
    event('EscrowCreated', { amount: '1000', creator: 'Creator111' }),
    TX_REF,
  )
  assert.strictEqual(bare.rec.transitions[0].patch.creator_address, 'Creator111')
  assert.strictEqual('assigned_counterparty_address' in bare.rec.transitions[0].patch, false)
})

test('signer addresses: the counterparty wallet rides the SAME install/release as its id', async () => {
  // Install (accept) writes the event wallet…
  const accepted = makeDeps({ wallets: { Cp111: 'user-cp' } })
  await applyEscrowEvent(
    accepted.deps,
    event('EscrowAccepted', { counterparty: 'Cp111', completion_deadline: '1900007200' }),
    TX_REF,
  )
  assert.strictEqual(accepted.rec.transitions[0].patch.counterparty_address, 'Cp111')

  // …an assign installs (a RE-assign therefore overwrites, never staleness)…
  const assigned = makeDeps({ wallets: { W2wallet: 'user-w2' } })
  await applyEscrowEvent(
    assigned.deps,
    event('CounterpartyAssigned', {
      counterparty: 'W2wallet',
      assigned_by: 'Creator111',
      completion_deadline: '1900007200',
    }),
    TX_REF,
  )
  assert.strictEqual(assigned.rec.transitions[0].patch.counterparty_address, 'W2wallet')

  // …and a release clears the wallet WITH the id, even though the event still
  // names the released worker (the fan-out needs them; the row must not).
  const released = makeDeps({ wallets: { W2wallet: 'user-w2' } })
  await applyEscrowEvent(
    released.deps,
    event('AssignmentReleased', { counterparty: 'W2wallet', released_by: 'Creator111' }),
    TX_REF,
  )
  assert.strictEqual(released.rec.transitions[0].patch.counterparty_id, null)
  assert.strictEqual(released.rec.transitions[0].patch.counterparty_address, null)
})

test('signer addresses: an UNKNOWN wallet still records the chain fact (id null, address kept)', async () => {
  // A back-door accept from an unlinked wallet: no user resolves, but the
  // chain bound that wallet — recording it is truthful, and nobody can read
  // it back (my_signer_address matches on the NULL id, so it reaches no one).
  const { deps, rec } = makeDeps() // no wallets resolve
  await applyEscrowEvent(
    deps,
    event('EscrowAccepted', { counterparty: 'Stranger1', completion_deadline: '1900007200' }),
    TX_REF,
  )
  assert.strictEqual(rec.transitions[0].patch.counterparty_id, null)
  assert.strictEqual(rec.transitions[0].patch.counterparty_address, 'Stranger1')
})

test('EscrowDeclined: status stays (no status in patch), assignment cleared', async () => {
  const { deps, rec } = makeDeps()
  await applyEscrowEvent(deps, event('EscrowDeclined', { declined_by: 'X' }), TX_REF)
  assert.strictEqual(rec.transitions[0].patch.status, undefined)
  assert.strictEqual(rec.transitions[0].patch.assigned_counterparty_id, null)
  // The baked wallet describes the assignment it belongs to — it goes with it.
  assert.strictEqual(rec.transitions[0].patch.assigned_counterparty_address, null)
})

test('ProofSubmitted: accepted→submitted with submitted_at + approval_deadline', async () => {
  const { deps, rec } = makeDeps()
  await applyEscrowEvent(
    deps,
    event('ProofSubmitted', {
      counterparty: 'Cp111',
      approval_deadline: '1900180000',
      timestamp: '1900007000',
    }),
    TX_REF,
  )
  const patch = rec.transitions[0].patch
  assert.strictEqual(patch.status, 'submitted')
  assert.strictEqual(patch.submitted_at?.getTime(), 1_900_007_000_000)
  assert.strictEqual(patch.approval_deadline?.getTime(), 1_900_180_000_000)
})

test('settlement events record amount + fee; DisputeRaised guards both prior statuses', async () => {
  const { deps, rec } = makeDeps()
  await applyEscrowEvent(
    deps,
    event('EscrowApproved', { amount: '975', platform_fee: '25', creator: 'C' }),
    'sig-a',
  )
  assert.strictEqual(rec.transactions[0].amount_raw, '975')
  assert.strictEqual(rec.transactions[0].platform_fee_raw, '25')

  await applyEscrowEvent(
    deps,
    event('DisputeRaised', { bond_amount: '100', raised_by: 'R', from_status: 'accepted' }),
    'sig-b',
  )
  assert.deepStrictEqual(rec.transitions[1].from, ['accepted', 'submitted'])
  assert.strictEqual(rec.transactions[1].amount_raw, '100')
})

test('DisputeResolved: disputed→resolved + dispute row stamped with the winner', async () => {
  const { deps, rec } = makeDeps()
  await applyEscrowEvent(
    deps,
    event('DisputeResolved', {
      winner: 'split',
      creator_payout: '500',
      counterparty_payout: '501',
      platform_fee: '0',
    }),
    TX_REF,
  )
  assert.deepStrictEqual(rec.resolutions, [{ escrow_id: ESCROW_ID, winner: 'split' }])
  // Both sides' shares land on the audit row: the counterparty's in
  // amount_raw (same slot approve/claim use), the creator's in its own
  // column — a split pays both, so one column could never tell the story.
  assert.strictEqual(rec.transactions[0].amount_raw, '501')
  assert.strictEqual(rec.transactions[0].creator_payout_raw, '500')
  assert.strictEqual(rec.transactions[0].platform_fee_raw, '0')
})

test('non-resolve events record NO creator payout (the column is resolve-only)', async () => {
  const { deps, rec } = makeDeps({ wallets: { C: 'user-c' } })
  await applyEscrowEvent(
    deps,
    event('EscrowApproved', { amount: '975', platform_fee: '25', creator: 'C' }),
    TX_REF,
  )
  assert.strictEqual(rec.transactions[0].creator_payout_raw, null)
})

test('status-guard trip: no transaction row, no resolution, applied:false', async () => {
  const { deps, rec } = makeDeps({ guardTrips: true })
  const r = await applyEscrowEvent(
    deps,
    event('EscrowApproved', { amount: '975', platform_fee: '25', creator: 'C' }),
    TX_REF,
  )
  assert.strictEqual(r.applied, false)
  assert.strictEqual(rec.transactions.length, 0)
})

test('unknown actor wallet → actor_id null (event still applies)', async () => {
  const { deps, rec } = makeDeps({ wallets: {} })
  await applyEscrowEvent(
    deps,
    event('EscrowCancelled', { refund_amount: '1000', creator: 'Unknown111' }),
    TX_REF,
  )
  assert.strictEqual(rec.transactions[0].actor_id, null)
})

test('missing escrow_id in decoded fields throws (decoder bug, not data)', async () => {
  const { deps } = makeDeps()
  await assert.rejects(
    applyEscrowEvent(
      deps,
      { name: 'EscrowCreated', escrow_ref: 'X', contract: TEST_ESCROW_PROGRAM, fields: {} },
      TX_REF,
    ),
    /missing escrow_id/,
  )
})

// ---------- approval mode (stage 10) ---------------------------------------

test('CounterpartyAssigned: open→accepted, installs the worker, actor is the CREATOR', async () => {
  const { deps, rec } = makeDeps({
    wallets: { Creator111: 'user-creator', Worker111: 'user-worker' },
  })
  const r = await applyEscrowEvent(
    deps,
    event('CounterpartyAssigned', {
      counterparty: 'Worker111',
      assigned_by: 'Creator111',
      completion_deadline: '1900007200',
    }),
    TX_REF,
  )
  assert.strictEqual(r.applied, true)
  assert.strictEqual(r.internal_event, 'escrow.counterparty_assigned')

  const [t] = rec.transitions
  assert.deepStrictEqual(t.from, ['open'])
  assert.strictEqual(t.patch.status, 'accepted')
  // The worker becomes the counterparty even though they signed nothing.
  assert.strictEqual(t.patch.counterparty_id, 'user-worker')
  assert.deepStrictEqual(t.patch.completion_deadline, new Date(1_900_007_200 * 1000))

  // The poster's transaction must NOT be attributed to the worker — that is
  // the whole reason this is a distinct event and tx type.
  const [tx] = rec.transactions
  assert.strictEqual(tx.type, 'assign_accept')
  assert.strictEqual(tx.actor_id, 'user-creator')
})

test('CounterpartyAssigned: unknown worker wallet leaves counterparty_id null, still applies', async () => {
  const { deps, rec } = makeDeps({ wallets: { Creator111: 'user-creator' } })
  const r = await applyEscrowEvent(
    deps,
    event('CounterpartyAssigned', {
      counterparty: 'Stranger111',
      assigned_by: 'Creator111',
      completion_deadline: '1900007200',
    }),
    TX_REF,
  )
  // The chain is the source of truth: the transition lands regardless of
  // whether we can name the wallet's owner.
  assert.strictEqual(r.applied, true)
  assert.strictEqual(rec.transitions[0].patch.counterparty_id, null)
})

test('AssignmentReleased: accepted→open, CLEARS counterparty and completion_deadline', async () => {
  const { deps, rec } = makeDeps({ wallets: { Creator111: 'user-creator' } })
  const r = await applyEscrowEvent(
    deps,
    event('AssignmentReleased', { counterparty: 'Worker111', released_by: 'Creator111' }),
    TX_REF,
  )
  assert.strictEqual(r.applied, true)
  assert.strictEqual(r.internal_event, 'escrow.assignment_released')

  const [t] = rec.transitions
  assert.deepStrictEqual(t.from, ['accepted'])
  assert.strictEqual(t.patch.status, 'open')
  // Both must be nulled: a rewound escrow with a stale deadline would be
  // judged by the expiry sweep as if someone were still working on it.
  assert.strictEqual(t.patch.counterparty_id, null)
  assert.strictEqual(t.patch.completion_deadline, null)
  // And the rest of the assignment CYCLE, which the status rewind alone left
  // behind: a stale release stamp made the next worker's assignment read as
  // already-released, dropped the gig out of their active-gig cap and
  // suppressed their abandonment strike for good.
  assert.strictEqual(t.patch.assignment_released_at, null)
  assert.strictEqual(t.patch.assigned_from_application, false)
  // The declarative `reverts_application_cycle` reached the store, so the
  // applications are undone in the SAME commit as the transition.
  assert.notStrictEqual(t.revertApplications, undefined)
  assert.strictEqual(rec.transactions[0].type, 'unassign')
  assert.strictEqual(rec.transactions[0].actor_id, 'user-creator')
})

// The inverse, and the reason the flag is declared per-event rather than
// inferred: no other transition may quietly undo a settled application.
/**
 * The declarative pair, asserted against the WHOLE table rather than a sample:
 * one event settles an application cycle, exactly one undoes it. Adding an
 * event that quietly declares either flag fails here, which is the point of
 * declaring them in a table instead of branching on the event name.
 */
test('exactly one event settles a cycle, and exactly one reverts it', () => {
  const declaring = (flag: 'settles_application' | 'reverts_application_cycle') =>
    Object.entries(EVENT_APPLICATIONS)
      .filter(([, app]) => app[flag] === true)
      .map(([name]) => name)

  assert.deepStrictEqual(declaring('settles_application'), ['CounterpartyAssigned'])
  assert.deepStrictEqual(declaring('reverts_application_cycle'), ['AssignmentReleased'])
})

test('the revert reaches the store for AssignmentReleased and NO other event', async () => {
  // Every wire event, not a sample: the whole point of a declarative flag is
  // that adding an event cannot quietly opt into undoing someone's
  // application. Only `escrow_id` is supplied — the stubbed store never
  // touches a database, and no `patch` in the table throws on absent fields.
  for (const name of ESCROW_EVENTS) {
    const { deps, rec } = makeDeps({ wallets: { Creator111: 'user-creator' } })
    await applyEscrowEvent(deps, event(name, {}), `${TX_REF}-${name}`)

    const asked = rec.transitions[0]?.revertApplications !== undefined
    assert.strictEqual(
      asked,
      name === 'AssignmentReleased',
      `${name}: revertApplications should be ${name === 'AssignmentReleased'}`,
    )
  }
})

// The released worker is CLEARED from the escrow row by the transition above,
// so the push fan-out (which re-reads that row afterwards) has no way to
// address them. The applier therefore hands the resolved user back out. Drop
// this and "your assignment was withdrawn" silently reaches nobody.
test('AssignmentReleased returns the released worker even though the row no longer names them', async () => {
  const { deps, rec } = makeDeps({
    wallets: { Worker111: 'user-worker', Creator111: 'user-creator' },
  })
  const r = await applyEscrowEvent(
    deps,
    event('AssignmentReleased', { counterparty: 'Worker111', released_by: 'Creator111' }),
    TX_REF,
  )
  assert.strictEqual(r.counterparty_id, 'user-worker')
  // …and the row itself really is cleared, so the two are not the same read.
  assert.strictEqual(rec.transitions[0].patch.counterparty_id, null)
})

test('CounterpartyAssigned returns the installed worker; unrelated events return null', async () => {
  const { deps } = makeDeps({ wallets: { Worker111: 'user-worker', Creator111: 'user-creator' } })
  const assigned = await applyEscrowEvent(
    deps,
    event('CounterpartyAssigned', {
      counterparty: 'Worker111',
      assigned_by: 'Creator111',
      completion_deadline: '1900007200',
    }),
    TX_REF,
  )
  assert.strictEqual(assigned.counterparty_id, 'user-worker')

  const { deps: deps2 } = makeDeps({ wallets: { Creator111: 'user-creator' } })
  const created = await applyEscrowEvent(
    deps2,
    event('EscrowCreated', { amount: '1000', creator: 'Creator111' }),
    'sig-2',
  )
  assert.strictEqual(created.counterparty_id, null)
})

test('AssignmentReleased: guard trips when the escrow is no longer accepted', async () => {
  const { deps, rec } = makeDeps({ guardTrips: true })
  const r = await applyEscrowEvent(
    deps,
    event('AssignmentReleased', { counterparty: 'Worker111', released_by: 'Creator111' }),
    TX_REF,
  )
  assert.strictEqual(r.applied, false)
  assert.strictEqual(rec.transactions.length, 0)
})

test('assign/unassign tx types round-trip through EVENT_BY_TX_TYPE', () => {
  assert.strictEqual(EVENT_BY_TX_TYPE.assign_accept, 'CounterpartyAssigned')
  assert.strictEqual(EVENT_BY_TX_TYPE.unassign, 'AssignmentReleased')
  // Every tx type must name an event that actually exists on the wire.
  for (const [tx_type, evt] of Object.entries(EVENT_BY_TX_TYPE)) {
    assert.ok(
      (ESCROW_EVENTS as readonly string[]).includes(evt),
      `${tx_type} maps to unknown event ${evt}`,
    )
    assert.strictEqual(EVENT_APPLICATIONS[evt].tx_type, tx_type)
  }
})
