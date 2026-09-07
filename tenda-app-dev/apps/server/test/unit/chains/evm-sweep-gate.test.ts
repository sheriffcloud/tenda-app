/**
 * Whether an EVM chain offers the sweep port at all (#43).
 *
 * The port's presence IS the switch — `jobs/sweep-escrows` skips any chain
 * whose adapter has no `sweep`, silently and forever. So this file guards the
 * one thing that decides whether the platform spends its gas float on other
 * people's refunds on a given chain.
 *
 * The case that matters is the middle one: a chain configured to relay for
 * agents, which must NOT thereby be sweeping. Relaying is gas spent serving a
 * flow an agent asked for and paid into; sweeping is an open-ended outflow on
 * escrows nobody asked us to touch. They share a wallet and nothing else, and
 * before #43's flag the wallet alone decided both.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evmAdapter } from '@server/chains/evm'
import type { EvmRelayer } from '@server/chains/evm/relay/relayer'

const CHAIN_ID = 'eip155:84532'
const CONTRACT = '0x00000000000000000000000000000000000000c1'
const RELAYER: `0x${string}` = '0x00000000000000000000000000000000000000a1'

const relayer: EvmRelayer = {
  address: RELAYER,
  async supportsReceiveWithAuthorization() {
    return true
  },
  async simulate() {},
  async send() {
    return `0x${'11'.repeat(32)}` as `0x${string}`
  },
}

function adapterWith(deps: { relayer?: EvmRelayer; sweepEnabled?: boolean }) {
  return evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 1,
    deps: {
      resolveWalletAddress: async () => CONTRACT,
      resolveAsset: async () => ({ token_address: null }),
      ...deps,
    },
  })
}

test('a relayer WITHOUT the flag offers no sweep port — the defect the flag exists for', () => {
  const adapter = adapterWith({ relayer })
  assert.equal(adapter.sweep, undefined, 'agent funding must not silently enable sweeping')
  assert.ok(adapter.relay, 'while relaying itself is unaffected')
})

test('a relayer WITH the flag offers the sweep port, paid from that same wallet', () => {
  const adapter = adapterWith({ relayer, sweepEnabled: true })
  assert.ok(adapter.sweep)
  assert.equal(adapter.sweep.sweeper_address, RELAYER)
})

test('the flag alone sweeps nothing — there is no wallet to pay with', () => {
  // CHAIN_<ID>_SWEEP_ENABLED=true on a chain with no relayer key is a
  // misconfiguration, not a licence: the port stays absent rather than
  // appearing and failing at broadcast time on every tick.
  const adapter = adapterWith({ sweepEnabled: true })
  assert.equal(adapter.sweep, undefined)
})

test('neither, the default: no relay and no sweep', () => {
  const adapter = adapterWith({})
  assert.equal(adapter.sweep, undefined)
  assert.equal(adapter.relay, undefined)
})

test('sweepEnabled false is the same as absent', () => {
  assert.equal(adapterWith({ relayer, sweepEnabled: false }).sweep, undefined)
})
