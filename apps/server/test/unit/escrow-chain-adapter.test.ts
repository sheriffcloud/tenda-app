/**
 * lib/escrow/chain-adapter — the single place an escrow action asks the
 * registry for its chain's adapter.
 *
 * `ChainRegistry.get` throws a plain Error for an unknown id, which the app
 * error handler turns into a 500 plus a Sentry report. These pin that the
 * helper refuses with a 503 BEFORE `get` is ever reached, and that a configured
 * chain is handed straight through.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { requireChainAdapter } from '@server/lib/escrow/chain-adapter'
import { fakeRegistry, TEST_CHAIN_ID } from '../helpers/test-app/fake-chain'

test('a configured chain returns its adapter', () => {
  const chains = fakeRegistry()
  assert.strictEqual(requireChainAdapter(chains, TEST_CHAIN_ID), chains.get(TEST_CHAIN_ID))
})

test('a deconfigured chain is a 503 SERVICE_UNAVAILABLE naming the chain, and get() is never reached', () => {
  let getCalls = 0
  const chains = {
    has: () => false,
    get: (chain_id: string): never => {
      getCalls += 1
      throw new Error(`no adapter registered for chain_id '${chain_id}'`)
    },
  }
  assert.throws(
    () => requireChainAdapter(chains, 'eip155:999'),
    (e: unknown) =>
      e instanceof Error &&
      'statusCode' in e && e.statusCode === 503 &&
      'code' in e && e.code === 'SERVICE_UNAVAILABLE' &&
      e.message.includes("'eip155:999'"),
  )
  assert.strictEqual(getCalls, 0, 'the registry throw must never be the thing that answers')
})

test('an id the registry does not know is refused with the SAME 503, not the raw throw', () => {
  // The real registry, not a stub: `has` is false for an unregistered id.
  assert.throws(
    () => requireChainAdapter(fakeRegistry(), 'solana:never-registered'),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 503,
  )
})
