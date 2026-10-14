/**
 * The LIVE funder-balance reader behind the gas-seed low-balance alert (#53b).
 *
 * Four lines of adapter, and every one of them is a decision the alert's
 * correctness rests on — which is why they are tested against an injected
 * funder map rather than left to the process-wide one. `seededChainBalance`
 * itself binds the real map by design; `seededChainBalanceFrom` is the same
 * body with the map handed in, the same port split the senders use.
 *
 * The distinction under test is null-vs-throw-vs-zero. All three mean different
 * things downstream: `seedStanding` turns null into a RETRYABLE
 * SeedBalanceUnreadableError, and 0n into an alert saying grants have stopped.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { seededChainBalanceFrom } from '@server/features/alerts'
import type { GasSeedFunder } from '@server/features/gas-seed'

const CHAIN = 'eip155:16602'

function funderMap(balance: () => Promise<bigint>): ReadonlyMap<string, GasSeedFunder> {
  return new Map([[CHAIN, { address: '0xfunder', balance }]])
}

test('a readable wallet answers with its balance', async () => {
  const read = await seededChainBalanceFrom(funderMap(async () => 42n), CHAIN)
  assert.strictEqual(read, 42n)
})

test('an EMPTY wallet answers 0n, never null', async () => {
  // The single most important distinction in this file. Null means "could not
  // read" and alerts nobody; 0n means "grants have STOPPED", which is the
  // loudest thing this feature says. Collapsing them would make a drained
  // wallet indistinguishable from a flaky RPC.
  const read = await seededChainBalanceFrom(funderMap(async () => 0n), CHAIN)
  assert.strictEqual(read, 0n)
})

test('a chain with NO configured seed key reads as unreadable, not as empty', async () => {
  // A funder is absent from the map when the chain configured no GAS_SEED_KEY.
  // That chain pays nobody, so there is no wallet to call empty.
  const read = await seededChainBalanceFrom(funderMap(async () => 1n), 'eip155:404')
  assert.strictEqual(read, null)
})

test('an RPC failure becomes null rather than propagating', async () => {
  // The whole reason this adapter exists. An unguarded rejection would reach
  // `deliverAlert` as a raw failure and skip the translation into a
  // SeedBalanceUnreadableError that the retry decision depends on.
  const read = await seededChainBalanceFrom(
    funderMap(() => Promise.reject(new Error('rpc down'))),
    CHAIN,
  )
  assert.strictEqual(read, null)
})

test('a NON-Error rejection is caught too', async () => {
  // `catch` with no binding, deliberately: a library that rejects with a string
  // or an object is caught the same way. A guard written as
  // `catch (e) { if (e instanceof Error) ... }` would rethrow this one.
  const read = await seededChainBalanceFrom(funderMap(() => Promise.reject('nope')), CHAIN)
  assert.strictEqual(read, null)
})

test('a SYNCHRONOUS throw from balance() is caught as well', async () => {
  // `funder.balance()` is typed as returning a promise, but a throw before the
  // first await is synchronous — and `.catch()` alone would not see it, so the
  // caller would get an exception where it expects a value.
  const map: ReadonlyMap<string, GasSeedFunder> = new Map([
    [CHAIN, { address: '0xfunder', balance: () => { throw new Error('sync boom') } }],
  ])
  await assert.doesNotReject(() => seededChainBalanceFrom(map, CHAIN))
  assert.strictEqual(await seededChainBalanceFrom(map, CHAIN), null)
})
