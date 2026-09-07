/**
 * chainLabel — human name straight from CHAIN_MANIFEST (ported from mobile
 * when the module moved here). Asserts against the real manifest, no mocks.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainLabel } from '../../src/utils/chain-label'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'

test('names mainnet chains from the manifest', () => {
  assert.equal(chainLabel('solana:mainnet'), 'Solana')
  assert.equal(chainLabel('eip155:8453'), 'BASE')
})

test('distinguishes testnets by their own display name', () => {
  assert.equal(chainLabel('solana:devnet'), 'Solana Devnet')
  assert.equal(chainLabel('eip155:84532'), 'Base Sepolia')
})

test('every manifest entry resolves to its own displayName', () => {
  for (const entry of CHAIN_MANIFEST) {
    assert.equal(chainLabel(entry.id), entry.displayName)
  }
})

test('falls back to "Unknown" for ids not in the manifest', () => {
  assert.equal(chainLabel('eip155:999999'), 'Unknown')
  assert.equal(chainLabel('bogus'), 'Unknown')
  assert.equal(chainLabel(''), 'Unknown')
})
