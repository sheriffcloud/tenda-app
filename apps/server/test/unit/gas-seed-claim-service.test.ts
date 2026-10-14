/**
 * `POST /v1/wallet/gas-seed` (#53c-1): what a claim records, what it queues, and
 * what it undoes when queuing fails.
 *
 * The slot is taken BEFORE the transfer is queued — that ordering is what makes
 * a double pay impossible — so the cases here are mostly about the two ways
 * that ordering can go wrong: a claim reserved with no job to service it, and a
 * repeat that pays twice.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import { claimGasSeed } from '@server/features/gas-seed'
import { AppError } from '@server/lib/errors'
import { makeDeps, MOBILE, SOLANA, ZEROG } from '../helpers/gas-seed-claim'

// ---------- claiming --------------------------------------------------------------

test('a claim takes the slot FIRST, then queues the transfer', async () => {
  const { deps, grants, enqueued } = makeDeps({ wallets: { eip155: '0xE' } })
  const res = await claimGasSeed(deps, MOBILE, 'eip155:16661')

  assert.deepStrictEqual(res, {
    chain_id: 'eip155:16661',
    state: 'in_progress',
    amount_raw: '10000000000000000',
    queued: true,
  })
  assert.strictEqual(grants.length, 1)
  assert.deepStrictEqual(enqueued, [{ user_id: 'u-1', chain_id: 'eip155:16661' }])
})

test('the claim records WHO was paid and WHICH hot wallet pays', async () => {
  // The rotation fix (#53c-1 DoD 6): with the funder recorded per grant,
  // rolling a key stops retroactively flagging every grant the old wallet paid.
  const { deps, grants } = makeDeps({ wallets: { eip155: '0xE' } })
  await claimGasSeed(deps, MOBILE, 'eip155:16661')
  assert.strictEqual(grants[0]?.wallet_address, '0xE')
  assert.strictEqual(grants[0]?.funder_address, 'funder-of-eip155:16661')
  // No reference yet, and that IS the state: nothing has been signed. Before
  // #58 this asserted a `pending:<user>:<chain>` placeholder standing in for a
  // transaction that did not exist.
  assert.strictEqual(grants[0]?.status, 'claimed')
  assert.strictEqual(grants[0]?.tx_ref, null)
})

test('a SEQUENTIAL double tap is idempotent — 202, under way, nothing re-queued', async () => {
  // The user tapped twice and the first row has landed. They asked for their
  // seed and their seed is coming, so this is a success. Telling them "already
  // claimed" would be wrong (they have nothing yet) and erroring would be
  // unhelpful — the claim is exactly as they wanted it.
  const { deps, enqueued } = makeDeps({ wallets: { eip155: '0xE' } })
  const first = await claimGasSeed(deps, MOBILE, 'eip155:16661')
  const second = await claimGasSeed(deps, MOBILE, 'eip155:16661')

  assert.strictEqual(first.queued, true)
  assert.deepStrictEqual(second, {
    chain_id: 'eip155:16661',
    state: 'in_progress',
    amount_raw: '10000000000000000',
    queued: false,
  })
  assert.strictEqual(enqueued.length, 1, 'a repeat tap enqueued a second transfer')
})

test('a CONCURRENT double tap gives the same answer as a sequential one', async () => {
  // A TRUE race, not a repeat: this request's evaluation saw no grant (the
  // winner had not committed yet) and only discovers the collision when its
  // INSERT loses. That is a different code path from the sequential repeat
  // above — it reaches the claim — and it must land on the same answer, or the
  // same user action would return a 202 or a 409 depending on the millisecond.
  const { deps, enqueued } = makeDeps({ wallets: { eip155: '0xE' } })
  let readsBeforeInsert = 0
  const racing: typeof deps = {
    ...deps,
    seed: { ...deps.seed, claimGrant: async () => false },
    claim: {
      ...deps.claim,
      // Null while evaluating (the winner is mid-flight), the winner's row once
      // the losing insert has come back — exactly what the race looks like.
      async findGrant() {
        readsBeforeInsert += 1
        // The winner's row is `claimed` — its slot is taken and its broadcast
        // job is queued, which is exactly what the loser must report.
        return readsBeforeInsert === 1 ? null : { status: 'claimed' }
      },
    },
  }
  const loser = await claimGasSeed(racing, MOBILE, 'eip155:16661')

  assert.strictEqual(loser.queued, false)
  assert.strictEqual(loser.state, 'in_progress')
  assert.deepStrictEqual(enqueued, [], 'the loser of the race queued a second transfer')
})

test('claiming again AFTER the transfer landed reports claimed, and queues nothing', async () => {
  const { deps, enqueued } = makeDeps({
    wallets: { eip155: '0xE' },
    grants: [
      {
        user_id: 'u-1',
        chain_id: 'eip155:16661',
        amount_raw: '10000000000000000',
        status: 'delivered',
        tx_ref: '0xrealhash',
      },
    ],
  })
  const res = await claimGasSeed(deps, MOBILE, 'eip155:16661')
  assert.strictEqual(res.state, 'claimed')
  assert.strictEqual(res.queued, false)
  assert.strictEqual(enqueued.length, 0)
})

test('a claim that cannot be queued RELEASES the slot instead of stranding the user', async () => {
  // Without the release the grant row stays `pending:` with no job to finish
  // it — permanently `in_progress`, the one state the surface cannot leave by
  // itself. Releasing is safe here precisely because nothing was sent.
  const { deps, grants, released } = makeDeps({ wallets: { eip155: '0xE' }, enqueueFails: true })
  await assert.rejects(
    () => claimGasSeed(deps, MOBILE, 'eip155:16661'),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 503 &&
      err.code === ErrorCode.SERVICE_UNAVAILABLE,
  )
  assert.deepStrictEqual(released, [{ user_id: 'u-1', chain_id: 'eip155:16661' }])
  assert.strictEqual(grants.length, 0, 'the slot survived a failed enqueue')
})

test('with no queue at all the claim is refused BEFORE the slot is taken', async () => {
  const { deps, grants, released } = makeDeps({ wallets: { eip155: '0xE' }, noQueue: true })
  await assert.rejects(
    () => claimGasSeed(deps, MOBILE, 'eip155:16661'),
    (err: unknown) => err instanceof AppError && err.statusCode === 503,
  )
  assert.strictEqual(grants.length, 0)
  assert.deepStrictEqual(released, [], 'nothing to release — the slot was never taken')
})

test('an unknown chain id gets the same answer as a chain that offers nothing', async () => {
  // This endpoint must not double as a probe for which chains a deployment runs.
  const { deps } = makeDeps({ wallets: { eip155: '0xE' } })
  await assert.rejects(
    () => claimGasSeed(deps, MOBILE, 'eip155:999999'),
    (err: unknown) =>
      err instanceof AppError && err.code === ErrorCode.GAS_SEED_UNAVAILABLE && err.statusCode === 409,
  )
})

test('a refused claim never touches the queue or the grant table', async () => {
  const { deps, grants, enqueued } = makeDeps({ wallets: { eip155: '0xE' }, phone: false })
  await assert.rejects(
    () => claimGasSeed(deps, MOBILE, 'eip155:16661'),
    (err: unknown) => err instanceof AppError && err.code === ErrorCode.PHONE_VERIFICATION_REQUIRED,
  )
  assert.strictEqual(grants.length, 0)
  assert.strictEqual(enqueued.length, 0)
})

test('a chain switched off by an operator refuses the claim', async () => {
  const { deps, grants } = makeDeps({
    wallets: { eip155: '0xE' },
    disabled: ['eip155:16661'],
  })
  await assert.rejects(
    () => claimGasSeed(deps, MOBILE, 'eip155:16661'),
    (err: unknown) => err instanceof AppError && err.code === ErrorCode.GAS_SEED_UNAVAILABLE,
  )
  assert.strictEqual(grants.length, 0)
})

test('claiming one chain leaves the other chain claimable', async () => {
  // The grant is keyed (user_id, chain_id), so a user seeded on Solana is still
  // owed one on 0G. A key of user_id alone would silently break this.
  const { deps, grants } = makeDeps({
    chains: [SOLANA, ZEROG],
    wallets: { solana: 'W1', eip155: '0xE' },
  })
  await claimGasSeed(deps, MOBILE, 'solana:devnet')
  const res = await claimGasSeed(deps, MOBILE, 'eip155:16661')
  assert.strictEqual(res.queued, true)
  assert.deepStrictEqual(grants.map((g) => g.chain_id), ['solana:devnet', 'eip155:16661'])
})
