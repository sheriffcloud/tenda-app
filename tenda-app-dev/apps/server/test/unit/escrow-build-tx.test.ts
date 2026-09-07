/**
 * lib/escrow/build-tx — the single seam every escrow transition builds through.
 *
 * It exists so the "which contract holds this escrow's funds" question cannot be
 * skipped: eleven routes plus the dispute-resolve path used to repeat
 * `chains.get(...).buildTx(...)` inline, and a twelfth would have repeated it
 * without the guard. These tests pin that the guard is actually applied and that
 * a refusal builds NOTHING — a transaction sent to the wrong contract reverts on
 * chain and strands the escrow, so failing closed is the whole point.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { buildEscrowTx } from '@server/lib/escrow'
import { buildContractRegistry } from '@server/chains/contracts'
import type { ChainAdapter, ChainRegistry, UnsignedTx } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'

const CHAIN = 'solana:devnet'
const CURRENT = 'CurrentProgram11111111111111111111111111'
const PREVIOUS = 'PreviousProgram1111111111111111111111111'
const LINKED_WALLET = 'LinkedWallet1111111111111111111111111111'

const UNSIGNED: UnsignedTx = {
  kind: 'solana-tx',
  tx_base64: 'AA==',
  recent_blockhash: 'hash',
  last_valid_block_height: 1,
}

/**
 * Stand-in for the one query the post-build linked check runs
 * (resolveUserByWallet's select→from→where→limit) — same boundary pattern as
 * registry-sync.test.ts's fakeDb. `queried` proves absence means NO query.
 */
function fakeDb(rows: Array<{ user_id: string }>, queried = { count: 0 }): AppDatabase {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            queried.count += 1
            return rows
          },
        }),
      }),
    }),
  }
  return db as unknown as AppDatabase
}

/** Records what the adapter was asked to build against. */
function harness(opts: { chainConfigured?: boolean; unsigned?: UnsignedTx } = {}) {
  const seen: Array<string | undefined> = []
  const adapter: ChainAdapter = {
    namespace: 'solana',
    chain_id: CHAIN,
    escrowAddress: CURRENT,
    async buildTx(args) {
      seen.push(args.contract)
      return opts.unsigned ?? UNSIGNED
    },
    async verifyTx() {
      throw new Error('not used')
    },
    async verifyAuthSig() {
      return true
    },
    async fetchEscrowState() {
      return null
    },
    computeFee() {
      return '0'
    },
  }
  const chains: ChainRegistry = {
    get: () => adapter,
    has: () => opts.chainConfigured ?? true,
    list: () => [adapter],
    verifyAuthSig: async () => true,
  }
  return { chains, seen }
}

const registry = (rows: Array<{ chain_id: string; address: string }> = []) =>
  buildContractRegistry([{ chain_id: CHAIN, namespace: 'solana', escrowAddress: CURRENT }], rows)

const escrow = (escrow_contract: string | null) => ({
  id: 'e1111111-2222-4333-8444-555555555555',
  chain_id: CHAIN,
  escrow_contract,
})

const action = { action: 'approveCompletion', user_id: 'u1', payload: { escrow_id: 'e1' } } as const

test('builds against the contract the escrow is pinned to, not the current one', async () => {
  const { chains, seen } = harness()
  const contracts = registry([{ chain_id: CHAIN, address: PREVIOUS }])

  await buildEscrowTx({ db: fakeDb([{ user_id: 'u1' }]), chains, contracts }, escrow(PREVIOUS), action)

  assert.deepStrictEqual(seen, [PREVIOUS])
})

test('passes the current contract when that is where the escrow lives', async () => {
  const { chains, seen } = harness()
  await buildEscrowTx({ db: fakeDb([{ user_id: 'u1' }]), chains, contracts: registry() }, escrow(CURRENT), action)
  assert.deepStrictEqual(seen, [CURRENT])
})

test('an unstamped escrow resolves to the chain’s sole contract', async () => {
  const { chains, seen } = harness()
  await buildEscrowTx({ db: fakeDb([{ user_id: 'u1' }]), chains, contracts: registry() }, escrow(null), action)
  assert.deepStrictEqual(seen, [CURRENT])
})

test('an unknown stamp refuses and builds NOTHING', async () => {
  // Failing closed matters more than the status code: a built transaction would
  // be broadcast and revert, and the escrow would be stuck with no way back.
  const { chains, seen } = harness()
  await assert.rejects(
    buildEscrowTx({ db: fakeDb([{ user_id: 'u1' }]), chains, contracts: registry() }, escrow('ForeignProgram111111111111111111111111'), action),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ESCROW_MISMATCH',
  )
  assert.deepStrictEqual(seen, [], 'no transaction may be built for a refused escrow')
})

test('a resolved signer the caller no longer has linked is refused BY NAME', async () => {
  // The post-build tripwire: an unlinked signer would make verify-tx install
  // NULL actors when the event lands. Deleting the assert in buildEscrowTx
  // fails this — the unsigned tx would be returned as if nothing were wrong.
  const { chains } = harness({ unsigned: { ...UNSIGNED, signer_address: LINKED_WALLET } })
  await assert.rejects(
    buildEscrowTx({ db: fakeDb([]), chains, contracts: registry() }, escrow(CURRENT), action),
    (e: unknown) =>
      e instanceof Error &&
      'code' in e && e.code === 'ESCROW_WRONG_WALLET' &&
      'details' in e &&
      (e.details as { required_address?: string }).required_address === LINKED_WALLET,
  )
})

test('a resolved signer the caller owns passes; an ABSENT signer skips the check', async () => {
  const owned = harness({ unsigned: { ...UNSIGNED, signer_address: LINKED_WALLET } })
  const result = await buildEscrowTx(
    { db: fakeDb([{ user_id: 'u1' }]), chains: owned.chains, contracts: registry() },
    escrow(CURRENT),
    action,
  )
  assert.strictEqual(result.kind === 'solana-tx' ? result.signer_address : undefined, LINKED_WALLET)

  // Fail-open contract: no signer_address (EVM read failure) → no DB query,
  // no refusal — exactly the pre-existing behaviour.
  const queried = { count: 0 }
  const absent = harness()
  await buildEscrowTx(
    { db: fakeDb([], queried), chains: absent.chains, contracts: registry() },
    escrow(CURRENT),
    action,
  )
  assert.strictEqual(queried.count, 0, 'absent signer_address must not query the trust list')
})

test('resolveDispute skips the linked check — the authority is not a linked wallet', async () => {
  const { chains } = harness({ unsigned: { ...UNSIGNED, signer_address: 'AuthorityWallet111111111111111111111111' } })
  const result = await buildEscrowTx(
    { db: fakeDb([]), chains, contracts: registry() },
    escrow(CURRENT),
    {
      action: 'resolveDispute',
      user_id: 'admin-1',
      signer_address: 'AuthorityWallet111111111111111111111111',
      payload: { escrow_id: 'e1', winner: 'creator', raiser_user_id: 'u1' },
    },
  )
  assert.strictEqual(result.kind, 'solana-tx')
})

test('a deconfigured chain is a clean 503, not the registry’s raw throw', async () => {
  // The chain can disappear from env after an escrow exists (rollback, env
  // trimmed). Routes must surface that as unavailable rather than a 500.
  const { chains, seen } = harness({ chainConfigured: false })
  await assert.rejects(
    buildEscrowTx({ db: fakeDb([{ user_id: 'u1' }]), chains, contracts: registry() }, escrow(CURRENT), action),
    (e: unknown) =>
      e instanceof Error &&
      'statusCode' in e &&
      e.statusCode === 503 &&
      'code' in e &&
      e.code === 'SERVICE_UNAVAILABLE',
  )
  assert.deepStrictEqual(seen, [])
})
