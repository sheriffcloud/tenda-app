/**
 * The harness's substitution seam (#109): `realEvmRegistry`, and the
 * `fakeRegistry(substitute)` underneath it.
 *
 * It exists so the x402 recorder can put the REAL eip155 adapter in front of a
 * real anvil node while every other harness behaviour stays fake. Its only
 * caller is an anvil-gated integration suite, so without these cases the seam
 * is unexercised on any machine without the foundry toolchain.
 *
 * The property that must not break is one a COMMENT in fake-chain.ts currently
 * carries alone: the Solana adapter stays FIRST, because `reconcile-escrows`
 * falls back to `list()[0]` and the listeners plugin picks the first Solana
 * adapter. A substitution written as delete-then-set, or keyed on the wrong
 * chain, moves it — and every suite that depends on the order would fail
 * somewhere else entirely.
 *
 * Imported from `./fake-chain` rather than the barrel on purpose: `fakeRegistry`
 * is deliberately not re-exported (no suite builds its own registry), and the
 * module under test is the one place that may reach past that.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChainAdapter } from '@server/chains/types'
import {
  FAKE_BAD_SIGNATURE,
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  PAUSED_CHAIN_ID,
  UNREGISTERED_CHAIN_ID,
  fakeRegistry,
  realEvmRegistry,
} from '../helpers/test-app/fake-chain'

/**
 * A stand-in for the anvil-backed adapter: the harness's own eip155 fake with a
 * marker address, so this file never hand-writes a second ChainAdapter that
 * would drift from the interface the real one implements.
 */
const REAL_ESCROW = `0x${'ab'.repeat(20)}`
const realAdapter: ChainAdapter = { ...fakeRegistry().get(TEST_CHAIN_ID_ALT), escrowAddress: REAL_ESCROW }

test('realEvmRegistry serves the given adapter on the eip155 chain', () => {
  const registry = realEvmRegistry(realAdapter)
  assert.strictEqual(registry.get(TEST_CHAIN_ID_ALT), realAdapter, 'the substituted adapter should be the very object passed in')
  assert.strictEqual(registry.get(TEST_CHAIN_ID_ALT).escrowAddress, REAL_ESCROW)
  assert.strictEqual(registry.has(TEST_CHAIN_ID_ALT), true)
})

test('the substitution does not reorder the registry — Solana stays list()[0]', () => {
  const adapters = realEvmRegistry(realAdapter).list()
  assert.strictEqual(adapters.length, 3, 'a substitution must REPLACE the eip155 adapter, never add a fourth chain (the third is the paused one)')
  assert.strictEqual(adapters[0]?.namespace, 'solana', 'reconcile-escrows and the listeners plugin read list()[0]')
  assert.strictEqual(adapters[0]?.chain_id, TEST_CHAIN_ID)
  assert.strictEqual(adapters[1], realAdapter)
  assert.strictEqual(adapters[2]?.chain_id, PAUSED_CHAIN_ID, 'the paused chain keeps its fake adapter, registered last')
})

test('everything except that one adapter stays fake', () => {
  const registry = realEvmRegistry(realAdapter)
  const solana = registry.get(TEST_CHAIN_ID)
  const untouched = fakeRegistry().get(TEST_CHAIN_ID)
  assert.strictEqual(solana.namespace, untouched.namespace)
  assert.strictEqual(solana.escrowAddress, untouched.escrowAddress)
  assert.notStrictEqual(solana.escrowAddress, REAL_ESCROW)
  // The Solana fake deliberately has no relay — it is the 503 path — so a
  // substitution that leaked the real adapter onto both chains shows up here.
  assert.strictEqual(solana.relay, undefined)
  assert.throws(() => registry.get(UNREGISTERED_CHAIN_ID), /no adapter registered/)
})

test('wallet auth stays the offline stand-in, for the substituted chain too', async () => {
  // The recorder registers its agent through the real POST /v1/agent/register.
  // If substituting the adapter also substituted signature verification, that
  // registration would need a real signature and the recording could not be
  // captured at all.
  const registry = realEvmRegistry(realAdapter)
  const args = { address: `0x${'12'.repeat(20)}`, message: 'auth', signature: 'sig:agent' }
  assert.strictEqual(await registry.verifyAuthSig(TEST_CHAIN_ID_ALT, args), true)
  assert.strictEqual(
    await registry.verifyAuthSig(TEST_CHAIN_ID_ALT, { ...args, signature: FAKE_BAD_SIGNATURE }),
    false,
    'the bad-signature sentinel must still be refused',
  )
})
