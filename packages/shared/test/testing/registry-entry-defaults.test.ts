import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'
import { chainPublicFacts } from '../../src/chains/manifest-queries'
import { FIXTURE_APPROVAL_WINDOW_SECONDS, registryEntryDefaults } from '../../src/testing'

test('a known chain id gets the manifest\'s real public facts and no relay', () => {
  assert.deepEqual(registryEntryDefaults('eip155:84532'), {
    network_kind: 'testnet',
    relayed_funding_available: false,
    approval_window_seconds: FIXTURE_APPROVAL_WINDOW_SECONDS,
    rpc_url: 'https://sepolia.base.org',
    explorer_url: 'https://sepolia.basescan.org',
    faucet_url: 'https://faucet.circle.com',
  })
  assert.deepEqual(registryEntryDefaults('eip155:84532'), {
    network_kind: 'testnet',
    relayed_funding_available: false,
    approval_window_seconds: FIXTURE_APPROVAL_WINDOW_SECONDS,
    ...chainPublicFacts('eip155:84532'),
  })
  // A fixture's window is a number a real chain can carry, in whole seconds.
  assert.equal(FIXTURE_APPROVAL_WINDOW_SECONDS, 86_400)
  assert.equal(registryEntryDefaults('eip155:42220').network_kind, 'mainnet')
})

test('a fabricated chain id is a testnet with nulls — a chain the route could never serve', () => {
  assert.deepEqual(registryEntryDefaults('eip155:999999'), {
    network_kind: 'testnet',
    relayed_funding_available: false,
    approval_window_seconds: FIXTURE_APPROVAL_WINDOW_SECONDS,
    rpc_url: null,
    explorer_url: null,
    faucet_url: null,
  })
})

test('identity fields plus the defaults plus assets is a complete entry — the seam the fixtures rely on', () => {
  // Compile-time is the assertion: if ChainRegistryEntry gains a required
  // field the helper does not supply, this literal stops type-checking, which
  // is the one-edit signal #140 exists for. The runtime check is that an
  // override AFTER the spread wins, so a fixture can still ask for a relay.
  const entry: ChainRegistryEntry = {
    id: 'eip155:84532',
    namespace: 'eip155',
    display_name: 'Base Sepolia',
    escrow_address: '0xEscrow',
    ...registryEntryDefaults('eip155:84532'),
    relayed_funding_available: true,
    assets: [],
  }
  assert.equal(entry.relayed_funding_available, true)
  assert.equal(entry.faucet_url, 'https://faucet.circle.com')
})
