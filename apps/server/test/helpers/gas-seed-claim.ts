/**
 * The claim surface's unit fixture: seedable chains, a store pair backed by
 * arrays, funders that record whether their balance was actually READ, and a
 * queue that can be made to fail.
 *
 * Shared by the availability and claiming suites because they exercise the same
 * `GasSeedClaimDeps` from two directions — and because a second copy of a
 * fixture this size drifts: one suite gains a field, the other keeps passing
 * against the old shape, and the two stop describing the same system.
 */

import * as assert from 'node:assert'
import type { GasGrantStatus } from '@tenda/shared'
import type {
  ClaimIdentity,
  GasSeedClaimDeps,
  GasSeedClaimStore,
  GasSeedFunder,
  GasSeedStore,
  SeedableChain,
} from '@server/features/gas-seed'

export const ZEROG: SeedableChain = {
  chain_id: 'eip155:16661',
  namespace: 'eip155',
  gas_seed_amount_raw: '10000000000000000',
}
export const SOLANA: SeedableChain = {
  chain_id: 'solana:devnet',
  namespace: 'solana',
  gas_seed_amount_raw: '5000000',
}

export const MOBILE: ClaimIdentity = { user_id: 'u-1', client: 'mobile' }

export interface GrantRow {
  user_id: string
  chain_id: string
  amount_raw: string
  /** Where the grant sits. Since #58 this, not a tx_ref prefix, IS the state. */
  status: GasGrantStatus
  tx_ref: string | null
  submitted_at?: Date | null
  wallet_address?: string
  funder_address?: string
}

export function makeDeps(opts: {
  chains?: SeedableChain[]
  wallets?: Partial<Record<string, string>>
  grants?: GrantRow[]
  disabled?: string[]
  balances?: Partial<Record<string, bigint>>
  /** Chains with a configured hot wallet; defaults to every chain in `chains`. */
  funded?: string[]
  suspended?: boolean
  agent?: boolean
  device?: boolean
  phone?: boolean
  enqueueFails?: boolean
  noQueue?: boolean
}) {
  const chains = opts.chains ?? [ZEROG]
  const grants: GrantRow[] = [...(opts.grants ?? [])]
  const enqueued: Array<{ user_id: string; chain_id: string }> = []
  const released: Array<{ user_id: string; chain_id: string }> = []
  /** Which chains had their balance actually READ — the two-phase proof. */
  const balanceReads: string[] = []

  const seed: GasSeedStore = {
    async findSeedableChains() {
      return chains
    },
    async findWalletAddress(_user_id, namespace) {
      return opts.wallets?.[namespace] ?? null
    },
    async claimGrant(row) {
      if (grants.some((g) => g.user_id === row.user_id && g.chain_id === row.chain_id)) return false
      // `claimed` with no reference — the shape the endpoint actually inserts.
      grants.push({ ...row, status: 'claimed', tx_ref: null, submitted_at: null })
      return true
    },
    async markSubmitted() {
      assert.fail('the claim endpoint must never record a transfer — that is the job')
    },
    async markDelivered() {
      assert.fail('the claim endpoint must never deliver — that is the confirm job')
    },
    async markUnresolved() {
      assert.fail('the claim endpoint must never resolve — that is the confirm job')
    },
    async releaseGrant(user_id, chain_id) {
      released.push({ user_id, chain_id })
      const i = grants.findIndex((g) => g.user_id === user_id && g.chain_id === chain_id)
      if (i >= 0) grants.splice(i, 1)
    },
  }

  const claim: GasSeedClaimStore = {
    async claimantFacts() {
      return {
        client: null, // supplied by the caller from the token, never by the store
        has_device_token: opts.device ?? true,
        has_verified_phone: opts.phone ?? true,
        is_suspended: opts.suspended ?? false,
        is_agent: opts.agent ?? false,
      }
    },
    async findGrant(user_id, chain_id) {
      const g = grants.find((x) => x.user_id === user_id && x.chain_id === chain_id)
      return g === undefined ? null : { status: g.status }
    },
    async findGrantForJob() {
      assert.fail('only the job reads the claimed grant')
    },
    async disabledChains() {
      return new Set(opts.disabled ?? [])
    },
  }

  const fundedIds = opts.funded ?? chains.map((c) => c.chain_id)
  const funders = new Map<string, GasSeedFunder>(
    fundedIds.map((id) => [
      id,
      {
        address: `funder-of-${id}`,
        async balance() {
          balanceReads.push(id)
          return opts.balances?.[id] ?? 10n ** 30n
        },
      },
    ]),
  )

  const deps: GasSeedClaimDeps = {
    seed,
    claim,
    funders,
    enqueue: (opts.noQueue ?? false)
      ? null
      : async (job) => {
          if (opts.enqueueFails ?? false) throw new Error('redis down')
          enqueued.push(job)
        },
    log: { info() {}, warn() {} },
  }
  return { deps, grants, enqueued, released, balanceReads }
}

