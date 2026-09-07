/**
 * features/gas-seed — claim-first idempotency, PER-CHAIN sender routing (#53a),
 * transfer-failure rollback, chain-driven configuration.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  dispatchGasSeeds,
  type GasSeedDeps,
  type GasSeedSender,
  type GasSeedStore,
  type SeedableChain,
} from '@server/features/gas-seed'

const SOLANA_CHAIN: SeedableChain = {
  chain_id: 'solana:devnet',
  namespace: 'solana',
  gas_seed_amount_raw: '5000000',
}

/**
 * Two EVM chains, both seedable, both `eip155`. They are the shape a
 * namespace-keyed sender map could not represent — a deployment runs one chain
 * per FAMILY, and 0g/base are different families — and the amounts differ by
 * nine orders of magnitude because the decimals do.
 */
const ZEROG_CHAIN: SeedableChain = {
  chain_id: 'eip155:16661',
  namespace: 'eip155',
  gas_seed_amount_raw: '10000000000000000',
}
const BASE_CHAIN: SeedableChain = {
  chain_id: 'eip155:84532',
  namespace: 'eip155',
  gas_seed_amount_raw: '20000',
}

interface Grant {
  user_id: string
  chain_id: string
  amount_raw: string
  tx_ref: string
}

/** What a fake sender was asked to do, and WHICH sender was asked. */
interface Transfer {
  /** The chain id the sender was registered under — not the one dispatch had. */
  sender_of: string
  to_address: string
  amount_raw: string
}

function makeDeps(opts: {
  chains?: SeedableChain[]
  wallets?: Partial<Record<string, string>>
  senderFails?: boolean
  /** The transfer lands, but stamping the real tx_ref fails (a DB blip). */
  finalizeFails?: boolean
  /** Chain ids that configured a seed key; defaults to every chain in `chains`. */
  senderChains?: string[]
  preGranted?: Grant[]
}): { deps: GasSeedDeps; grants: Grant[]; transfers: Transfer[] } {
  const chains = opts.chains ?? [SOLANA_CHAIN]
  const grants: Grant[] = [...(opts.preGranted ?? [])]
  const transfers: Transfer[] = []
  const store: GasSeedStore = {
    async findSeedableChains() {
      return chains
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
      if (opts.finalizeFails ?? false) throw new Error('connection terminated')
      const g = grants.find((x) => x.user_id === user_id && x.chain_id === chain_id)
      if (g) g.tx_ref = tx_ref
    },
    async releaseGrant(user_id, chain_id) {
      const i = grants.findIndex((x) => x.user_id === user_id && x.chain_id === chain_id)
      if (i >= 0) grants.splice(i, 1)
    },
  }

  // Each sender remembers the chain it was registered for, so a transfer can be
  // traced back to the sender that performed it — the only way to see whether
  // dispatch routed by chain or by something coarser.
  function senderFor(chain_id: string): GasSeedSender {
    return {
      async send({ to_address, amount_raw }) {
        if (opts.senderFails ?? false) throw new Error('rpc down')
        transfers.push({ sender_of: chain_id, to_address, amount_raw })
        return { tx_ref: `sig-${transfers.length}` }
      },
    }
  }
  const senderChains = opts.senderChains ?? chains.map((c) => c.chain_id)
  const senders = new Map(senderChains.map((id) => [id, senderFor(id)]))

  return { deps: { store, senders, log: { info() {}, warn() {} } }, grants, transfers }
}

test('grants once: transfer lands, real tx_ref stamped', async () => {
  const { deps, grants, transfers } = makeDeps({ wallets: { solana: 'Wallet111' } })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(r.granted, [{ chain_id: 'solana:devnet', tx_ref: 'sig-1' }])
  assert.deepStrictEqual(transfers, [
    { sender_of: 'solana:devnet', to_address: 'Wallet111', amount_raw: '5000000' },
  ])
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

test('sender not configured → skipped, no claim, no transfer', async () => {
  const { deps, grants, transfers } = makeDeps({
    wallets: { solana: 'Wallet111' },
    senderChains: [],
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

// ---------- per-chain routing (#53a) ----------------------------------------

test('two seedable chains in ONE namespace are each paid by their own sender', async () => {
  // The regression this exists for: `senders[chain.namespace]` compiles, passes
  // every single-chain test above, and here pays BOTH chains through whichever
  // eip155 sender happened to be in the map — wrong RPC, wrong hot wallet, and
  // 0G's 18-decimal amount broadcast on a chain expecting Base's.
  const { deps, transfers } = makeDeps({
    chains: [ZEROG_CHAIN, BASE_CHAIN],
    wallets: { eip155: '0xEvm' },
  })
  const r = await dispatchGasSeeds(deps, 'u-1')

  assert.deepStrictEqual(
    r.granted.map((g) => g.chain_id),
    ['eip155:16661', 'eip155:84532'],
  )
  assert.deepStrictEqual(transfers, [
    { sender_of: 'eip155:16661', to_address: '0xEvm', amount_raw: '10000000000000000' },
    { sender_of: 'eip155:84532', to_address: '0xEvm', amount_raw: '20000' },
  ])
})

test('a chain with no seed key is skipped even when a SIBLING in its namespace has one', async () => {
  // Namespace keying cannot express this at all: it would find the sibling's
  // sender under 'eip155' and pay a chain whose operator funded nothing.
  const { deps, grants, transfers } = makeDeps({
    chains: [ZEROG_CHAIN, BASE_CHAIN],
    wallets: { eip155: '0xEvm' },
    senderChains: [BASE_CHAIN.chain_id],
  })
  const r = await dispatchGasSeeds(deps, 'u-1')

  assert.deepStrictEqual(r.skipped, [
    { chain_id: 'eip155:16661', reason: 'seed wallet key not configured' },
  ])
  assert.deepStrictEqual(
    r.granted.map((g) => g.chain_id),
    ['eip155:84532'],
  )
  assert.deepStrictEqual(
    transfers.map((t) => t.sender_of),
    ['eip155:84532'],
  )
  assert.deepStrictEqual(
    grants.map((g) => g.chain_id),
    ['eip155:84532'],
  )
})

test('one user, two namespaces: each chain gets its own wallet and amount', async () => {
  const { deps, transfers } = makeDeps({
    chains: [SOLANA_CHAIN, ZEROG_CHAIN],
    wallets: { solana: 'Wallet111', eip155: '0xEvm' },
  })
  const r = await dispatchGasSeeds(deps, 'u-1')

  assert.strictEqual(r.granted.length, 2)
  assert.deepStrictEqual(transfers, [
    { sender_of: 'solana:devnet', to_address: 'Wallet111', amount_raw: '5000000' },
    { sender_of: 'eip155:16661', to_address: '0xEvm', amount_raw: '10000000000000000' },
  ])
})

test('a transfer that LANDS but cannot be stamped keeps its slot — never pays twice', async () => {
  // The asymmetry that decides this: releasing a slot whose transfer failed
  // costs a retry, releasing one whose transfer SUCCEEDED costs a second
  // payment. One shared try/catch around send+finalize could not tell them
  // apart, so a DB blip after the money left the hot wallet freed the slot and
  // the next wallet link paid the same user again.
  const { deps, grants, transfers } = makeDeps({
    wallets: { solana: 'Wallet111' },
    finalizeFails: true,
  })
  const r = await dispatchGasSeeds(deps, 'u-1')

  assert.strictEqual(transfers.length, 1, 'the transfer did happen')
  assert.deepStrictEqual(r.skipped, [
    { chain_id: 'solana:devnet', reason: 'granted but not recorded' },
  ])
  // The slot is STILL HELD, with the placeholder — the state verify-gas-seed.ts
  // reports as "slot claimed but transfer never finalized".
  assert.strictEqual(grants.length, 1)
  assert.match(grants[0]?.tx_ref ?? '', /^pending:/)

  // And a later dispatch must not pay again.
  const again = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(again.skipped[0]?.reason, 'already granted')
  assert.strictEqual(transfers.length, 1, 'still exactly one payment')
})

test('one chain failing to stamp does not stop the next chain from being seeded', async () => {
  // The `continue` that replaced the shared catch must not swallow the rest of
  // the loop: a per-chain failure is per-chain.
  const { deps, transfers } = makeDeps({
    chains: [SOLANA_CHAIN, ZEROG_CHAIN],
    wallets: { solana: 'Wallet111', eip155: '0xEvm' },
    senderChains: [ZEROG_CHAIN.chain_id],
  })
  const r = await dispatchGasSeeds(deps, 'u-1')
  assert.deepStrictEqual(r.skipped, [
    { chain_id: 'solana:devnet', reason: 'seed wallet key not configured' },
  ])
  assert.deepStrictEqual(
    transfers.map((t) => t.sender_of),
    ['eip155:16661'],
  )
})
