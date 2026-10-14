/**
 * The chain pause (`paused: true` on a manifest entry): the flag, the one
 * helper that reads it, the table that says what it refuses, and the invariants
 * that keep a paused entry an ordinary entry. The server half is
 * apps/server/test/integration/chain-pause.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAIN_MANIFEST, assertManifestValid, type ChainManifestEntry } from '../../src/chains/manifest'
import { chainById, firstEvmChainIdByKind } from '../../src/chains/manifest-queries'
import { chainPausedMessage, enabledChains, isBlockedByChainPause, isChainEnabled } from '../../src/chains/pause'
import { isBlockedByTakedown, type TakedownAction } from '../../src/constants/moderation'
import { ErrorCode } from '../../src/constants/errors'

const celo = chainById('eip155:42220')
const paused = (entry: ChainManifestEntry): ChainManifestEntry => ({ ...entry, paused: true })

test('isChainEnabled: an entry is enabled unless it says paused', () => {
  assert.equal(isChainEnabled({}), true)
  assert.equal(isChainEnabled({ paused: true }), false)
  assert.equal(isChainEnabled(celo), true)
  assert.equal(isChainEnabled(paused(celo)), false)
})

test('enabledChains drops exactly the paused entries and keeps manifest order', () => {
  // From the ENABLED chains: the real manifest pauses Base, and this test is about the flag, not about Base.
  const [first, second, third] = CHAIN_MANIFEST.filter((c) => c.paused !== true)
  const manifest = [first, paused(second), third]
  assert.deepEqual(enabledChains(manifest).map((c) => c.id), [first.id, third.id])
  assert.deepEqual(enabledChains().map((c) => c.id), CHAIN_MANIFEST.filter((c) => c.paused !== true).map((c) => c.id))
})

test('a paused chain stays in the manifest as data and still passes every invariant', () => {
  const manifest = CHAIN_MANIFEST.map((c) => (c.id === celo.id ? paused(c) : c))
  assert.doesNotThrow(() => assertManifestValid(manifest))
  assert.equal(manifest.find((c) => c.id === celo.id)?.status, celo.status, 'pausing does not touch status: the two are separate facts')
})

test('`paused: false` is refused — the flag is true or absent, never a second spelling of "not paused"', () => {
  const bad = { ...celo, paused: false } as unknown as ChainManifestEntry
  assert.throws(() => assertManifestValid([bad]), /paused must be `true` or omitted/)
})

test('the pause refuses the ways IN and keeps every way OUT: it IS the takedown table', () => {
  const IN: TakedownAction[] = ['create', 'accept', 'assign_accept', 'apply']
  const OUT: TakedownAction[] = ['decline', 'unassign', 'submit', 'approve', 'claim_stalled', 'cancel', 'refund_expired', 'reclaim_abandoned', 'dispute', 'resolve']
  for (const action of IN) assert.equal(isBlockedByChainPause(action), true, action)
  for (const action of OUT) assert.equal(isBlockedByChainPause(action), false, action)
  for (const action of [...IN, ...OUT]) assert.equal(isBlockedByChainPause(action), isBlockedByTakedown(action), `${action}: a second table has appeared`)
})

test('firstEvmChainIdByKind skips a paused chain: it would otherwise be stamped into new sign-in messages', () => {
  const evmTestnets = CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155' && c.kind === 'testnet' && c.paused !== true)
  assert.ok(evmTestnets.length >= 2, 'precondition: two EVM testnets to choose between')
  const [lead, next] = evmTestnets
  assert.equal(firstEvmChainIdByKind('testnet', CHAIN_MANIFEST), lead.id)
  const withLeadPaused = CHAIN_MANIFEST.map((c) => (c.id === lead.id ? paused(c) : c))
  assert.equal(firstEvmChainIdByKind('testnet', withLeadPaused), next.id)
  const allPaused = CHAIN_MANIFEST.map((c) => (c.namespace === 'eip155' && c.kind === 'testnet' ? paused(c) : c))
  assert.equal(firstEvmChainIdByKind('testnet', allPaused), undefined)
})

test('CHAIN_PAUSED is its own error code, and the message names the chain without inventing a reason', () => {
  assert.equal(ErrorCode.CHAIN_PAUSED, 'CHAIN_PAUSED')
  const message = chainPausedMessage('eip155:84532')
  assert.match(message, /eip155:84532/)
  assert.match(message, /GET \/v1\/platform\/chains/)
  // The way OUT is part of the message: a user holding an escrow on a paused chain must not read this as 'frozen'.
  assert.match(message, /Existing escrows on it can still be settled/)
  assert.match(message, /no new escrows or participants/)
})

// --- Base (paused 2026-10-02) -------------------------------------------------

test('BASE is paused on BOTH entries, still deployed as data, and every Base fact is still in the manifest', () => {
  const base = CHAIN_MANIFEST.filter((c) => c.family === 'base')
  assert.deepEqual(base.map((c) => c.id).sort(), ['eip155:8453', 'eip155:84532'])
  for (const entry of base) {
    assert.equal(entry.paused, true, `${entry.id} must be paused`)
    assert.equal(isChainEnabled(entry), false)
    assert.equal(entry.gasPolicy, 'paymaster', `${entry.id}: the paymaster policy is KEPT`)
    assert.ok(entry.assets.some((a) => a.id === 'USDC_BASE'), `${entry.id}: its assets are kept`)
  }
  // status is a separate fact: Sepolia stays 'live' (escrow deployed), mainnet 'planned'.
  assert.equal(chainById('eip155:84532').status, 'live')
  assert.equal(chainById('eip155:8453').status, 'planned')
})

test('with Base paused, no other chain is: only Base entries carry the flag', () => {
  assert.deepEqual(CHAIN_MANIFEST.filter((c) => c.paused === true).map((c) => c.family), ['base', 'base'])
  assert.ok(enabledChains().every((c) => c.family !== 'base'))
})

test('RE-ENABLING Base is one change: the same entry without its `paused` line is enabled and valid', () => {
  const unpaused = CHAIN_MANIFEST.map((c) => {
    const { paused: _removed, ...rest } = c
    return c.family === 'base' ? rest : c
  })
  assert.doesNotThrow(() => assertManifestValid(unpaused))
  assert.ok(enabledChains(unpaused).some((c) => c.id === 'eip155:84532'))
  assert.equal(firstEvmChainIdByKind('testnet', unpaused), 'eip155:84532')
})
