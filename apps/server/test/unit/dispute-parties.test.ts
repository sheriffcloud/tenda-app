/**
 * lib/disputes/parties — the creator-first party derivation shared by the
 * admin dossier and the mediation-thread context. Pure functions, no DB.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  counterpartyIdOf,
  partyIdsOf,
  deriveDisputeParties,
  type PartyEscrow,
  type PartyIdentity,
} from '@server/lib/disputes/parties'

const CREATOR = '11111111-1111-1111-1111-111111111111'
const WORKER = '22222222-2222-2222-2222-222222222222'
const ASSIGNED = '33333333-3333-3333-3333-333333333333'

const identities: PartyIdentity[] = [
  { id: CREATOR, first_name: 'Ada', last_name: 'Poster' },
  { id: WORKER, first_name: 'Ben', last_name: 'Worker' },
]

test('counterpartyIdOf: accepted counterparty wins over pre-assignment', () => {
  const escrow: PartyEscrow = {
    creator_id: CREATOR,
    counterparty_id: WORKER,
    assigned_counterparty_id: ASSIGNED,
  }
  assert.strictEqual(counterpartyIdOf(escrow), WORKER)
})

test('counterpartyIdOf: falls back to the pre-assigned party', () => {
  const escrow: PartyEscrow = {
    creator_id: CREATOR,
    counterparty_id: null,
    assigned_counterparty_id: ASSIGNED,
  }
  assert.strictEqual(counterpartyIdOf(escrow), ASSIGNED)
})

test('counterpartyIdOf: null when neither exists', () => {
  const escrow: PartyEscrow = { creator_id: CREATOR, counterparty_id: null, assigned_counterparty_id: null }
  assert.strictEqual(counterpartyIdOf(escrow), null)
})

test('partyIdsOf: deduped, non-null, creator + effective counterparty', () => {
  assert.deepStrictEqual(
    partyIdsOf({ creator_id: CREATOR, counterparty_id: WORKER, assigned_counterparty_id: null }),
    [CREATOR, WORKER],
  )
  assert.deepStrictEqual(
    partyIdsOf({ creator_id: CREATOR, counterparty_id: null, assigned_counterparty_id: null }),
    [CREATOR],
  )
})

test('deriveDisputeParties: creator-first, roles + raised marker on the raiser', () => {
  const parties = deriveDisputeParties(
    { creator_id: CREATOR, counterparty_id: WORKER, assigned_counterparty_id: null },
    WORKER,
    identities,
  )
  assert.strictEqual(parties.length, 2)
  assert.deepStrictEqual(parties[0], {
    role: 'creator',
    user_id: CREATOR,
    first_name: 'Ada',
    last_name: 'Poster',
    raised_dispute: false,
  })
  assert.deepStrictEqual(parties[1], {
    role: 'counterparty',
    user_id: WORKER,
    first_name: 'Ben',
    last_name: 'Worker',
    raised_dispute: true,
  })
})

test('deriveDisputeParties: counterparty omitted when the escrow was never assigned', () => {
  const parties = deriveDisputeParties(
    { creator_id: CREATOR, counterparty_id: null, assigned_counterparty_id: null },
    CREATOR,
    identities,
  )
  assert.strictEqual(parties.length, 1)
  assert.strictEqual(parties[0].role, 'creator')
  assert.strictEqual(parties[0].raised_dispute, true)
})

test('deriveDisputeParties: unnamed party resolves to null names, not a crash', () => {
  const parties = deriveDisputeParties(
    { creator_id: CREATOR, counterparty_id: ASSIGNED, assigned_counterparty_id: null },
    null,
    identities, // ASSIGNED absent from the identity list
  )
  assert.deepStrictEqual(parties[1], {
    role: 'counterparty',
    user_id: ASSIGNED,
    first_name: null,
    last_name: null,
    raised_dispute: false,
  })
})

test('deriveDisputeParties: pre-assigned-but-unaccepted party is named', () => {
  const parties = deriveDisputeParties(
    { creator_id: CREATOR, counterparty_id: null, assigned_counterparty_id: WORKER },
    null,
    identities,
  )
  assert.strictEqual(parties[1].user_id, WORKER)
  assert.strictEqual(parties[1].first_name, 'Ben')
})
