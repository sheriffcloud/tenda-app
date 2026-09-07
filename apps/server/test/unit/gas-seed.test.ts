/**
 * lib/gas-seed — claim-first idempotency, per-namespace sender gating,
 * transfer-failure rollback, chain-driven configuration.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  dispatchGasSeeds,
  type GasSeedDeps,
  type GasSeedStore,
  type SeedableChain,
} from '@server/lib/gas-seed'

const SOLANA_CHAIN: SeedableChain = {
  chain_id: 'solana:devnet',
  namespace: 'solana',
  gas_seed_amount_raw: '5000000',
}

interface Grant {
  user_id: string
  chain_id: string
  amount_raw: string
  tx_ref: string
}

function makeDeps(opts: {
  chains?: SeedableChain[]
  wallets?: Partial<Record<string, string>>
  senderFails?: boolean
  withSender?: boolean
  preGranted?: Grant[]
}): { deps: GasSeedDeps; grants: Grant[]; transfers: string[] } {
  const grants: Grant[] = [...(opts.preGranted ?? [])]
  const transfers: string[] = []
  const store: GasSeedStore = {
    async findSeedableChains() {
      return opts.chains ?? [SOLANA_CHAIN]
    },
    async findWalletAddress(_user_id, namespace) {
      return opts.wallets?.[namespace] ?? null
    },
    async claimGrant(row) {
      if (grants.some((g) => g.user_id === row.user_id && g.chain_id === row.chain_id)) {
        return false
      }
      grants.push(row)
      return true
    },
    async finalizeGrant(user_id, chain_id, tx_ref) {
      const g = grants.find((x) => x.user_id === user_id && x.chain_id === chain_id)
      if (g) g.tx_ref = tx_ref
    },
    async releaseGrant(user_id, chain_id) {
      const i = grants.findIndex((x) => x.user_id === user_id && x.chain_id === chain_id)
      if (i >= 0) grants.splice(i, 1)
    },
  }
  const deps: GasSeedDeps = {
    store,
    senders:
      (opts.withSender ?? true)
        ? {
            solana: {
              async send({ to_address }) {
                if (opts.senderFails ?? false) throw new Error('rpc down')
                transfers.push(to_address)
                return { tx_ref: `sig-${transfers.length}` }
              },
            },
          }
        : {},
    log: { info() {}, warn() {} },
  }
  return { deps, grants, transfers }
}

test('grants once: transfer lands, real tx_ref stamped', async () => {
  const { deps, grants, transfers } = makeDeps({ wallets: { solana: 'Wallet111' } })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(r.granted, [{ chain_id: 'solana:devnet', tx_ref: 'sig-1' }])
  assert.deepStrictEqual(transfers, ['Wallet111'])
  assert.strictEqual(grants[0].tx_ref, 'sig-1')
  assert.strictEqual(grants[0].amount_raw, SOLANA_CHAIN.gas_seed_amount_raw)
})

test('second dispatch is a no-op (claim loses the PK race)', async () => {
  const { deps, transfers } = makeDeps({ wallets: { solana: 'Wallet111' } })
  await dispatchGasSeeds(deps, 'u-1')
  const r2 = await dispatchGasSeeds(deps, 'u-1')
  assert.strictEqual(r2.granted.length, 0)
  assert.deepStrictEqual(r2.skipped[0]?.reason, 'already granted')
  assert.strictEqual(transfers.length, 1)
})

test('no wallet on the namespace → skipped, nothing claimed', async () => {
  const { deps, grants } = makeDeps({ wallets: {} })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(r.skipped[0]?.reason, 'no wallet on chain')
  assert.strictEqual(grants.length, 0)
})

test('sender not configured (#40 pending) → skipped, no claim, no transfer', async () => {
  const { deps, grants, transfers } = makeDeps({
    wallets: { solana: 'Wallet111' },
    withSender: false,
  })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.match(r.skipped[0]?.reason ?? '', /not configured/)
  assert.strictEqual(grants.length, 0)
  assert.strictEqual(transfers.length, 0)
})

test('transfer failure releases the claimed slot so a retry can succeed', async () => {
  const failing = makeDeps({ wallets: { solana: 'Wallet111' }, senderFails: true })
  const r1 = await dispatchGasSeeds(failing.deps, 'u-1')
  assert.deepStrictEqual(r1.skipped[0]?.reason, 'transfer failed')
  assert.strictEqual(failing.grants.length, 0) // slot released

  // Same store state, now with a working sender: the retry grants.
  const retry = makeDeps({ wallets: { solana: 'Wallet111' } })
  const r2 = await dispatchGasSeeds(retry.deps, 'u-1')
  assert.strictEqual(r2.granted.length, 1)
})

test('no seedable chains → empty result (BASE/CELO rely on paymaster/feeCurrency)', async () => {
  const { deps } = makeDeps({ chains: [], wallets: { solana: 'Wallet111' } })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(r, { granted: [], skipped: [] })
})
