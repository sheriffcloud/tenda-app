/**
 * The signer contract, server half: transitions on an existing escrow are
 * built FOR the chain-bound party address (never the primary-wallet guess),
 * free actions bake the validated requested wallet, and a client-declared
 * signer that the chain contradicts is refused BY NAME. Each test states the
 * reversion it fails under — reverting the resolvers to
 * `resolveWalletAddress(user_id)` breaks every bound case below.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { PublicKey } from '@solana/web3.js'
import { toHex } from 'viem'
import { resolveSolanaSigner, type EscrowSignerFields } from '@server/chains/solana/signer'
import { evmAdapter } from '@server/chains/evm'
import type { PaymasterHttp } from '@server/chains/evm/paymaster'
import { ZERO_ADDRESS, type EvmRpc } from '@server/chains/evm/rpc'
import { uuidToBytes } from '@server/chains/ids'
import { partyCaller, readSignerPreference } from '@server/lib/escrow'
import { AppError } from '@server/lib/errors'

// ---------- Solana ----------------------------------------------------------

const CREATOR_PK = new PublicKey(new Uint8Array(32).fill(1))
const WORKER_PK = new PublicKey(new Uint8Array(32).fill(2))
const ASSIGNEE_PK = new PublicKey(new Uint8Array(32).fill(3))
const PRIMARY = new PublicKey(new Uint8Array(32).fill(9)).toBase58()

const deps = { resolveWalletAddress: async () => PRIMARY }

function account(over: Partial<EscrowSignerFields> = {}): EscrowSignerFields {
  return { creator: CREATOR_PK, counterparty: WORKER_PK, assignedCounterparty: null, ...over }
}

const submitArgs = {
  action: 'submitProof',
  user_id: 'u1',
  caller: 'counterparty',
  payload: { escrow_id: 'e1', proof_hash: 'h' },
} as const

test('solana: a bound transition resolves the CHAIN address, not the primary', async () => {
  // The reported bug: submit built for the primary while the worker accepted
  // with another wallet. Reverting to resolveWalletAddress fails this.
  const signer = await resolveSolanaSigner(deps, submitArgs, account())
  assert.strictEqual(signer, WORKER_PK.toBase58())

  const approve = await resolveSolanaSigner(
    deps,
    { action: 'approveCompletion', user_id: 'u1', caller: 'creator', payload: { escrow_id: 'e1' } },
    account(),
  )
  assert.strictEqual(approve, CREATOR_PK.toBase58())
})

test('solana: a counterparty not yet accepted falls to the ASSIGNMENT, then free', async () => {
  // Assigned accept/decline must be signed by the assignee the chain holds.
  const assigned = await resolveSolanaSigner(
    deps,
    { action: 'acceptEscrow', user_id: 'u1', caller: 'counterparty', payload: { escrow_id: 'e1' } },
    account({ counterparty: null, assignedCounterparty: ASSIGNEE_PK }),
  )
  assert.strictEqual(assigned, ASSIGNEE_PK.toBase58())

  // Public accept: nothing bound — the requested wallet wins, else primary.
  const publicAccept = await resolveSolanaSigner(
    deps,
    {
      action: 'acceptEscrow',
      user_id: 'u1',
      caller: 'counterparty',
      signer_address: WORKER_PK.toBase58(),
      payload: { escrow_id: 'e1' },
    },
    account({ counterparty: null, assignedCounterparty: null }),
  )
  assert.strictEqual(publicAccept, WORKER_PK.toBase58())

  const defaulted = await resolveSolanaSigner(
    deps,
    { action: 'acceptEscrow', user_id: 'u1', caller: 'counterparty', payload: { escrow_id: 'e1' } },
    account({ counterparty: null, assignedCounterparty: null }),
  )
  assert.strictEqual(defaulted, PRIMARY)
})

test('solana: a requested signer the chain contradicts is refused BY NAME', async () => {
  await assert.rejects(
    resolveSolanaSigner(deps, { ...submitArgs, signer_address: PRIMARY }, account()),
    (e: unknown) =>
      e instanceof AppError &&
      e.statusCode === 422 &&
      e.code === 'ESCROW_WRONG_WALLET' &&
      e.details?.required_address === WORKER_PK.toBase58(),
  )
  // Agreement passes.
  const agreed = await resolveSolanaSigner(
    deps,
    { ...submitArgs, signer_address: WORKER_PK.toBase58() },
    account(),
  )
  assert.strictEqual(agreed, WORKER_PK.toBase58())
})

test('solana: create takes the requested wallet, else primary; resolve keeps the authority', async () => {
  const createArgs = {
    action: 'createEscrow',
    user_id: 'u1',
    payload: {
      escrow_id: 'e1', kind: 'gig', asset: 'USDC_SOL', amount_raw: '1',
      accept_deadline_unix: 1, completion_duration_seconds: 1, dispute_bond_raw: '0',
      is_seeker: false, requires_approval: false, unassign_window_seconds: 0,
    },
  } as const
  assert.strictEqual(
    await resolveSolanaSigner(deps, { ...createArgs, signer_address: WORKER_PK.toBase58() }, null),
    WORKER_PK.toBase58(),
  )
  assert.strictEqual(await resolveSolanaSigner(deps, createArgs, null), PRIMARY)

  const authority = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
  const resolved = await resolveSolanaSigner(
    deps,
    {
      action: 'resolveDispute',
      user_id: 'admin',
      signer_address: authority,
      payload: { escrow_id: 'e1', winner: 'creator', raiser_user_id: 'u1' },
    },
    account(),
  )
  assert.strictEqual(resolved, authority)
})

test('solana: an ASSIGNED_COUNTERPARTY caller is bound to the assignment', async () => {
  // deriveCaller answers 'assigned_counterparty' pre-accept (decline path);
  // the role must resolve to the assignee, never fall through to free.
  const signer = await resolveSolanaSigner(
    deps,
    { action: 'declineAssignedEscrow', user_id: 'u1', caller: 'assigned_counterparty', payload: { escrow_id: 'e1' } },
    account({ counterparty: null, assignedCounterparty: ASSIGNEE_PK }),
  )
  assert.strictEqual(signer, ASSIGNEE_PK.toBase58())
})

test('partyCaller: passes party roles through and trips on dispute_admin', () => {
  assert.strictEqual(partyCaller('creator'), 'creator')
  assert.strictEqual(partyCaller('counterparty'), 'counterparty')
  assert.strictEqual(partyCaller('assigned_counterparty'), 'assigned_counterparty')
  // Unreachable by construction (the state machine refuses admins on party
  // transitions first) — the tripwire must still be a loud 500, not a pass.
  assert.throws(
    () => partyCaller('dispute_admin'),
    (e: unknown) => e instanceof AppError && e.statusCode === 500,
  )
})

test('solana: a caller-less build (legacy caller) keeps the primary default', async () => {
  const signer = await resolveSolanaSigner(
    deps,
    { action: 'submitProof', user_id: 'u1', payload: { escrow_id: 'e1', proof_hash: 'h' } },
    account(),
  )
  assert.strictEqual(signer, PRIMARY)
})

// ---------- EVM (through the real adapter path) ------------------------------

const CHAIN_ID = 'eip155:8453'
const CONTRACT = '0x00000000000000000000000000000000000000e5' as const
const UUID = '0d9cd2a4-3f1e-4b6a-9c3d-2f1e4b6a9c3d'
const CREATOR = '0x1111111111111111111111111111111111111111'
const WORKER = '0x2222222222222222222222222222222222222222'

function fakeRpc(overrides: Partial<EvmRpc> = {}): EvmRpc {
  return {
    async getTransactionReceipt() { return null },
    async getBlockNumber() { return 100n },
    async getLogRefs() { return [] },
    async readEscrow() { return null },
    async readPermitFacts() {
      return { name: 'USDC', nonce: 0n, domain_separator: `0x${'00'.repeat(32)}` as const }
    },
    ...overrides,
  }
}

function escrowTuple(over: Partial<{ counterparty: `0x${string}` }> = {}) {
  return {
    escrow_id: toHex(uuidToBytes(UUID)) as `0x${string}`,
    kind: 0,
    asset: ZERO_ADDRESS as `0x${string}`,
    amount: 1_000_000n,
    creator: CREATOR as `0x${string}`,
    counterparty: (over.counterparty ?? WORKER) as `0x${string}`,
    assigned_counterparty: ZERO_ADDRESS as `0x${string}`,
    status: 2,
    accept_deadline: 1_900_000_000n,
    completion_duration: 7_200n,
    completion_deadline: 0n,
    approval_deadline: 0n,
    dispute_bond: 0n,
    is_seeker: false,
    raised_by: ZERO_ADDRESS as `0x${string}`,
    requires_approval: false,
    unassign_window_seconds: 0n,
  }
}

function makeAdapter(rpc: EvmRpc) {
  return evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 5,
    deps: {
      resolveWalletAddress: async () => CREATOR,
      resolveAsset: async () => ({ token_address: null }),
      rpc,
    },
  })
}

const evmSubmit = {
  action: 'submitProof',
  user_id: 'u1',
  caller: 'counterparty',
  payload: { escrow_id: UUID, proof_hash: `0x${'00'.repeat(32)}` },
} as const

test('evm: a bound transition reports the chain-bound sender on the wire', async () => {
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => escrowTuple() }))
  const unsigned = await adapter.buildTx(evmSubmit)
  assert.strictEqual(unsigned.kind, 'evm-tx')
  assert.strictEqual(unsigned.signer_address, WORKER)
})

test('evm: a checksummed request that matches the bound address (case-insensitive) passes', async () => {
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => escrowTuple() }))
  const unsigned = await adapter.buildTx({ ...evmSubmit, signer_address: WORKER.toUpperCase().replace('0X', '0x') })
  assert.strictEqual(unsigned.signer_address, WORKER)
})

test('evm: a requested signer the chain contradicts is a 422 naming the bound wallet', async () => {
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => escrowTuple() }))
  await assert.rejects(
    adapter.buildTx({ ...evmSubmit, signer_address: CREATOR }),
    (e: unknown) =>
      e instanceof AppError &&
      e.statusCode === 422 &&
      e.code === 'ESCROW_WRONG_WALLET' &&
      e.details?.required_address === WORKER,
  )
})

test('evm: an unreadable binding FAILS OPEN — tx built, field omitted', async () => {
  // Turning this into a throw would newly block approve on an RPC blip.
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => { throw new Error('rpc down') } }))
  const unsigned = await adapter.buildTx(evmSubmit)
  assert.strictEqual(unsigned.kind, 'evm-tx')
  assert.strictEqual('signer_address' in unsigned, false)
})

test('evm: an escrow the contract does not know (null read) fails open too', async () => {
  // readEscrow answers null for a never-created id (creator == ZERO) — not an
  // RPC failure, but the same honest answer: no binding to enforce.
  const adapter = makeAdapter(fakeRpc()) // default readEscrow → null
  const unsigned = await adapter.buildTx(evmSubmit)
  assert.strictEqual(unsigned.kind, 'evm-tx')
  assert.strictEqual('signer_address' in unsigned, false)
})

test('evm: a public accept (nothing bound) enforces only the declared wallet', async () => {
  const openTuple = {
    ...escrowTuple(),
    counterparty: ZERO_ADDRESS as `0x${string}`,
    status: 1,
  }
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => openTuple }))
  const acceptArgs = {
    action: 'acceptEscrow',
    user_id: 'u1',
    caller: 'counterparty',
    payload: { escrow_id: UUID },
  } as const
  const declared = await adapter.buildTx({ ...acceptArgs, signer_address: WORKER })
  assert.strictEqual(declared.signer_address, WORKER)
  const undeclared = await adapter.buildTx(acceptArgs)
  assert.strictEqual('signer_address' in undeclared, false)
})

test('evm: resolveDispute keeps the explicit authority on the wire', async () => {
  const adapter = makeAdapter(fakeRpc({ readEscrow: async () => escrowTuple() }))
  const unsigned = await adapter.buildTx({
    action: 'resolveDispute',
    user_id: 'admin-1',
    signer_address: CREATOR, // the configured authority, passed explicitly
    payload: { escrow_id: UUID, winner: 'creator', raiser_user_id: 'u1' },
  })
  assert.strictEqual(unsigned.kind, 'evm-tx')
  assert.strictEqual(unsigned.signer_address, CREATOR)
})

test('evm: create enforces only what the client itself declared', async () => {
  const adapter = makeAdapter(fakeRpc())
  const createArgs = {
    action: 'createEscrow',
    user_id: 'u1',
    payload: {
      escrow_id: UUID, kind: 'gig', asset: 'ETH_BASE', amount_raw: '5',
      accept_deadline_unix: 1_900_000_000, completion_duration_seconds: 3_600,
      dispute_bond_raw: '0', is_seeker: false, requires_approval: false,
      unassign_window_seconds: 0,
    },
  } as const
  const declared = await adapter.buildTx({ ...createArgs, signer_address: WORKER })
  assert.strictEqual(declared.signer_address, WORKER)
  const undeclared = await adapter.buildTx(createArgs)
  assert.strictEqual('signer_address' in undeclared, false)
})

test('evm: a SPONSORED bound transition targets the chain-bound sender, not the primary', async () => {
  // The userop's sender IS the signer — sponsoring the primary guess for an
  // escrow bound to another wallet would mint an operation the bound wallet
  // cannot use. Same truth source as the plain path.
  const sponsored: string[] = []
  const adapter = evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 5,
    deps: {
      resolveWalletAddress: async () => CREATOR, // the primary guess
      resolveAsset: async () => ({ token_address: null }),
      rpc: fakeRpc({ readEscrow: async () => escrowTuple() }),
      shouldSponsor: async () => true,
      paymaster: {
        async sponsorUserOperation(op) {
          sponsored.push(String(op.sender))
          return {
            paymaster_and_data: '0xfeed',
            pre_verification_gas: '0x1',
            verification_gas_limit: '0x2',
            call_gas_limit: '0x3',
          }
        },
      } satisfies PaymasterHttp,
    },
  })
  const tx = await adapter.buildTx(evmSubmit)
  assert.strictEqual(tx.kind, 'evm-userop')
  if (tx.kind === 'evm-userop') {
    assert.strictEqual(tx.user_op.sender, WORKER)
    assert.strictEqual(tx.signer_address, WORKER)
  }
  assert.deepStrictEqual(sponsored, [WORKER])
})

// ---------- route-layer body reader -----------------------------------------

test('readSignerPreference: absent stays absent, garbage is a 400, never a silent fallback', () => {
  assert.strictEqual(readSignerPreference(null), undefined)
  assert.strictEqual(readSignerPreference(undefined), undefined)
  assert.strictEqual(readSignerPreference({}), undefined)
  assert.strictEqual(readSignerPreference({ signer_address: '0xabc' }), '0xabc')
  for (const bad of [{ signer_address: '' }, { signer_address: 42 }, { signer_address: {} }]) {
    assert.throws(
      () => readSignerPreference(bad),
      (e: unknown) => e instanceof AppError && e.statusCode === 400,
    )
  }
})
