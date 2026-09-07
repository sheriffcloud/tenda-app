/**
 * chains/evm — builders (encode/decode round-trip + native-value rules),
 * verify pipeline (confirmations, revert, event decode, escrow_id check),
 * fetchEscrowState mapping, EOA auth-sig verify, paymaster sponsorship
 * with quota + degradation. Fully offline: fake EvmRpc/PaymasterHttp;
 * viem's pure encode/decode/sign primitives need no network.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  hashDomain,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { evmAdapter, type EvmAdapterDeps } from '@server/chains/evm'
import { buildEvmCall } from '@server/chains/evm/builders'
import { decodeEscrowLogs, escrowIdHexToUuid } from '@server/chains/evm/verify'
import { ESCROW_EVM_ABI, ZERO_ADDRESS, type EvmReceipt, type EvmRpc } from '@server/chains/evm/rpc'
import type { PaymasterHttp } from '@server/chains/evm/paymaster'
import { uuidToBytes } from '@server/chains/ids'
import { AppError } from '@server/lib/errors'
import { extractTxHashes } from '@server/routes/v1/webhooks/alchemy'
import {
  applyEscrowEvent,
  type EscrowEventStore,
  type EscrowEventTransaction,
  type EscrowPatch,
} from '@server/lib/escrow-events'
import type { EscrowStatus } from '@server/lib/escrow'

const CHAIN_ID = 'eip155:8453'
const CONTRACT = '0x00000000000000000000000000000000000000e5' as const
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const UUID = '0d9cd2a4-3f1e-4b6a-9c3d-2f1e4b6a9c3d'
const UUID_HEX = toHex(uuidToBytes(UUID))
const CREATOR = '0x1111111111111111111111111111111111111111'
const WORKER = '0x2222222222222222222222222222222222222222'
const TX = `0x${'ab'.repeat(32)}` as const

// ---------- fakes -----------------------------------------------------------

function fakeRpc(overrides: Partial<EvmRpc> = {}): EvmRpc {
  return {
    async getTransactionReceipt() {
      return null
    },
    async getBlockNumber() {
      return 100n
    },
    async getLogRefs() {
      return []
    },
    async readEscrow() {
      return null
    },
    async readPermitFacts() {
      return { name: 'USDC', nonce: 0n, domain_separator: `0x${'00'.repeat(32)}` as const }
    },
    ...overrides,
  }
}

function makeAdapter(deps: Partial<EvmAdapterDeps> = {}) {
  return evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 5,
    deps: {
      resolveWalletAddress: async () => CREATOR,
      resolveAsset: async (asset) =>
        asset === 'ETH_BASE' ? { token_address: null } : { token_address: USDC },
      rpc: fakeRpc(),
      ...deps,
    },
  })
}

const CREATE_ARGS = {
  action: 'createEscrow' as const,
  user_id: 'u1',
  payload: {
    escrow_id: UUID,
    kind: 'gig' as const,
    asset: 'USDC_BASE',
    amount_raw: '1000000',
    accept_deadline_unix: 1_900_000_000,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '50000',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  },
}

// ---------- builders ---------------------------------------------------------

test('builders: createEscrow round-trips through the ABI; ERC-20 carries no value', () => {
  const call = buildEvmCall(CREATE_ARGS, {
    asset_address: USDC,
    assigned_counterparty_address: null,
      worker_address: null,
      permit_encodable: true,
  })
  assert.strictEqual(call.value_raw, '0')
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  assert.strictEqual(decoded.functionName, 'createEscrow')
  // Single `CreateParams` struct — assert by NAME, so a field added to the
  // struct can never silently shift what this test believes it is checking.
  const [params] = decoded.args as readonly [Record<string, unknown>]
  assert.strictEqual(String(params.escrowId).toLowerCase(), UUID_HEX.toLowerCase())
  assert.strictEqual(params.kind, 0) // gig
  assert.strictEqual(String(params.asset).toLowerCase(), USDC.toLowerCase())
  assert.strictEqual(params.amount, 1_000_000n)
  assert.strictEqual(String(params.assignedCounterparty), ZERO_ADDRESS)
  assert.strictEqual(params.isSeeker, false)
  assert.strictEqual(params.requiresApproval, false)
  assert.strictEqual(params.unassignWindowSeconds, 0n)
})

test('builders: approval-mode create encodes the mode fields onto CreateParams', () => {
  const call = buildEvmCall(
    {
      ...CREATE_ARGS,
      payload: { ...CREATE_ARGS.payload, requires_approval: true, unassign_window_seconds: 21_600 },
    },
    { asset_address: USDC, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  const [params] = decoded.args as readonly [Record<string, unknown>]
  assert.strictEqual(params.requiresApproval, true)
  assert.strictEqual(params.unassignWindowSeconds, 21_600n)
})

test('builders: assignAccept encodes the resolved worker address', () => {
  const call = buildEvmCall(
    { action: 'assignAccept', user_id: 'u1', payload: { escrow_id: UUID, worker_user_id: 'w1' } },
    { asset_address: null, assigned_counterparty_address: null, worker_address: WORKER, permit_encodable: true },
  )
  assert.strictEqual(call.value_raw, '0')
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  assert.strictEqual(decoded.functionName, 'assignAccept')
  const args = decoded.args as readonly unknown[]
  assert.strictEqual(String(args[0]).toLowerCase(), UUID_HEX.toLowerCase())
  assert.strictEqual(String(args[1]).toLowerCase(), WORKER.toLowerCase())
})

test('builders: assignAccept without a resolved worker wallet throws, never encodes address(0)', () => {
  assert.throws(
    () =>
      buildEvmCall(
        { action: 'assignAccept', user_id: 'u1', payload: { escrow_id: UUID, worker_user_id: 'w1' } },
        { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
      ),
    /worker wallet/,
  )
})

test('builders: unassign encodes the single-arg escrow-id shape', () => {
  const call = buildEvmCall(
    { action: 'unassign', user_id: 'u1', payload: { escrow_id: UUID } },
    { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(call.value_raw, '0')
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  assert.strictEqual(decoded.functionName, 'unassign')
  assert.strictEqual(String((decoded.args as readonly unknown[])[0]).toLowerCase(), UUID_HEX.toLowerCase())
})

test('builders: native create carries amount as value; native dispute carries bond', () => {
  const native = buildEvmCall(
    { ...CREATE_ARGS, payload: { ...CREATE_ARGS.payload, asset: 'ETH_BASE' } },
    { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(native.value_raw, '1000000')

  const dispute = buildEvmCall(
    { action: 'disputeEscrow', user_id: 'u1', payload: { escrow_id: UUID, bond_raw: '777' } },
    { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(dispute.value_raw, '777')

  const disputeErc20 = buildEvmCall(
    { action: 'disputeEscrow', user_id: 'u1', payload: { escrow_id: UUID, bond_raw: '777' } },
    { asset_address: USDC, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(disputeErc20.value_raw, '0')
})

// A well-formed (not cryptographically valid) 65-byte signature: the builder
// only splits it; the token verifies it on-chain.
const SIG_65 = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`
const PERMIT_BODY = { value_raw: '1000000', deadline_unix: 1_900_000_000, signature: SIG_65 }

test('builders: permit create encodes createEscrowWithPermit with the signed tuple, value 0', () => {
  const call = buildEvmCall(
    { ...CREATE_ARGS, payload: { ...CREATE_ARGS.payload, permit: PERMIT_BODY } },
    { asset_address: USDC, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(call.value_raw, '0')
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  assert.strictEqual(decoded.functionName, 'createEscrowWithPermit')
  const [params, tuple] = decoded.args as readonly [
    Record<string, unknown>,
    { value: bigint; deadline: bigint; v: number; r: string; s: string },
  ]
  assert.strictEqual(params.amount, 1_000_000n) // create params unchanged
  assert.strictEqual(tuple.value, 1_000_000n)
  assert.strictEqual(tuple.deadline, 1_900_000_000n)
  assert.strictEqual(tuple.v, 27)
  assert.strictEqual(tuple.r, `0x${'11'.repeat(32)}`)
  assert.strictEqual(tuple.s, `0x${'22'.repeat(32)}`)
})

test('builders: permit on a native asset is rejected (last line of defense)', () => {
  assert.throws(
    () =>
      buildEvmCall(
        {
          ...CREATE_ARGS,
          payload: { ...CREATE_ARGS.payload, asset: 'ETH_BASE', permit: PERMIT_BODY },
        },
        { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
      ),
    /native asset/,
  )
  assert.throws(
    () =>
      buildEvmCall(
        {
          action: 'disputeEscrow',
          user_id: 'u1',
          payload: { escrow_id: UUID, bond_raw: '777', permit: PERMIT_BODY },
        },
        { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
      ),
    /native asset/,
  )
})

test('builders: permit dispute encodes disputeEscrowWithPermit, value 0', () => {
  const call = buildEvmCall(
    {
      action: 'disputeEscrow',
      user_id: 'u1',
      payload: { escrow_id: UUID, bond_raw: '777', permit: { ...PERMIT_BODY, value_raw: '777' } },
    },
    { asset_address: USDC, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(call.value_raw, '0')
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
  assert.strictEqual(decoded.functionName, 'disputeEscrowWithPermit')
  const args = decoded.args as readonly unknown[]
  const tuple = args[1] as { value: bigint }
  assert.strictEqual(tuple.value, 777n)
})

test('builders: malformed permit signature rejects with 422', () => {
  assert.throws(
    () =>
      buildEvmCall(
        {
          ...CREATE_ARGS,
          payload: {
            ...CREATE_ARGS.payload,
            permit: { ...PERMIT_BODY, signature: '0xdead' },
          },
        },
        { asset_address: USDC, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
      ),
    /65-byte/,
  )
})

test('builders: every escrow-id action encodes its own selector; resolveDispute maps winner codes', () => {
  for (const action of [
    'acceptEscrow',
    'declineAssignedEscrow',
    'approveCompletion',
    'claimStalledPayment',
    'cancelEscrow',
    'refundExpired',
    'reclaimAbandoned',
  ] as const) {
    const call = buildEvmCall(
      { action, user_id: 'u1', payload: { escrow_id: UUID } },
      { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
    )
    const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: call.data })
    assert.strictEqual(decoded.functionName, action)
  }

  const resolve = buildEvmCall(
    {
      action: 'resolveDispute',
      user_id: 'admin',
      // Signed by the configured dispute authority; not encoded in calldata.
      signer_address: '0x05A400000000000000000000000000000000dead',
      payload: { escrow_id: UUID, winner: 'split', raiser_user_id: 'u9' },
    },
    { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: resolve.data })
  assert.strictEqual(decoded.functionName, 'resolveDispute')
  assert.strictEqual((decoded.args as readonly unknown[])[1], 2)

  const submit = buildEvmCall(
    {
      action: 'submitProof',
      user_id: 'u1',
      payload: { escrow_id: UUID, proof_hash: `0x${'11'.repeat(32)}` },
    },
    { asset_address: null, assigned_counterparty_address: null, worker_address: null, permit_encodable: true },
  )
  assert.strictEqual(
    decodeFunctionData({ abi: ESCROW_EVM_ABI, data: submit.data }).functionName,
    'submitProof',
  )
})

// ---------- event decode --------------------------------------------------------

function acceptedLog() {
  // EscrowAccepted(bytes16 indexed escrowId, address indexed counterparty, uint64 completion_deadline)
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowAccepted',
    args: { escrowId: UUID_HEX, counterparty: WORKER },
  })
  const data = encodeAbiParameters([{ type: 'uint64' }], [1_900_007_200n])
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data }
}

function createdLog() {
  // EscrowCreated(bytes16 indexed, address indexed, uint8 kind, address asset, uint256 amount)
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowCreated',
    args: { escrowId: UUID_HEX, creator: CREATOR },
  })
  const data = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'address' }, { type: 'uint256' }],
    [0, USDC, 1_000_000n],
  )
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data }
}

test('decodeEscrowLogs: decodes wire events, stringifies amounts, recovers the UUID, skips foreign logs', () => {
  const foreign = { address: USDC, topics: [`0x${'00'.repeat(32)}`] as `0x${string}`[], data: '0x' as `0x${string}` }
  const events = decodeEscrowLogs([foreign, createdLog(), acceptedLog()], [CONTRACT], CHAIN_ID)
  assert.strictEqual(events.length, 2)

  const created = events[0]
  assert.strictEqual(created.name, 'EscrowCreated')
  assert.strictEqual(created.fields.amount, '1000000')
  // The canonical escrow id key MUST be `escrow_id` (the key applyEscrowEvent
  // and the Solana decoder both use) — never the adapter-local `escrow_id_uuid`.
  assert.strictEqual(created.fields.escrow_id, UUID)
  assert.strictEqual(created.fields.escrow_id_uuid, undefined)
  assert.strictEqual(created.actor, `${CHAIN_ID}:${CREATOR}`)

  assert.strictEqual(events[1].name, 'EscrowAccepted')
  assert.strictEqual(events[1].actor, `${CHAIN_ID}:${WORKER}`)
  // The completion deadline now rides the event (snake_case wire key so the
  // shared EVENT_APPLICATIONS reads it directly, matching the Solana decoder).
  assert.strictEqual(events[1].fields.completion_deadline, '1900007200')
})

// ADVERSARIAL (cross-seam): the EVM decoder feeds applyEscrowEvent, which
// reads `event.fields.escrow_id` and throws "missing escrow_id" otherwise.
// The old decoder emitted only `escrow_id_uuid`, so EVERY EVM event threw
// here. We exercise the real seam (decode → apply) rather than asserting the
// decoder's output shape in isolation. Fails against the pre-fix decoder.
test('decoded EVM EscrowCreated applies through applyEscrowEvent end-to-end', async () => {
  const [created] = decodeEscrowLogs([createdLog()], [CONTRACT], CHAIN_ID)
  const rec = { transitions: [] as Array<{ from: EscrowStatus[]; patch: EscrowPatch }>, txs: [] as EscrowEventTransaction[] }
  const store: EscrowEventStore = {
    async applyEvent({ from, patch, transaction }) {
      rec.transitions.push({ from, patch })
      rec.txs.push(transaction)
      return { applied: true, passed_applicant_ids: [], revived_applicant_ids: [] }
    },
    async resolveUserByWallet(_ns, address) {
      return address === CREATOR ? 'user-creator' : null
    },
  }
  const r = await applyEscrowEvent({ store, chain_ns: 'eip155' }, created, TX)

  assert.strictEqual(r.applied, true)
  assert.strictEqual(r.escrow_id, UUID) // extracted from fields.escrow_id, not a throw
  assert.strictEqual(r.internal_event, 'escrow.created')
  assert.deepStrictEqual(rec.transitions[0].from, ['draft'])
  assert.strictEqual(rec.transitions[0].patch.status, 'open')
  assert.strictEqual(rec.transitions[0].patch.escrow_ref, UUID_HEX) // EVM escrow_ref = bytes16 hex
  assert.strictEqual(rec.txs[0].amount_raw, '1000000')
  assert.strictEqual(rec.txs[0].actor_id, 'user-creator')
})

test('escrowIdHexToUuid round-trips uuidToBytes', () => {
  assert.strictEqual(escrowIdHexToUuid(UUID_HEX), UUID)
})

// ---------- settlement event decode (the enriched vocabulary) --------------------

function approvedLog() {
  // EscrowApproved(bytes16 indexed, address indexed creator, address counterparty, uint256 amount, uint256 platform_fee)
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowApproved',
    args: { escrowId: UUID_HEX, creator: CREATOR },
  })
  const data = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
    [WORKER, 990_000n, 10_000n],
  )
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data }
}

function resolvedLog() {
  // DisputeResolved(bytes16 indexed, uint8 winner, uint256 creator_payout,
  //                 uint256 counterparty_payout, uint256 platform_fee,
  //                 address bond_refund_to, uint256 bond_amount)
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'DisputeResolved',
    args: { escrowId: UUID_HEX },
  })
  const data = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
    [2, 500_000n, 500_000n, 0n, WORKER, 100_000n],
  )
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data }
}

test('decodeEscrowLogs: EscrowApproved carries the NET payout + fee, and the creator as actor', () => {
  const [approved] = decodeEscrowLogs([approvedLog()], [CONTRACT], CHAIN_ID)
  assert.strictEqual(approved.name, 'EscrowApproved')
  assert.strictEqual(approved.fields.amount, '990000') // net, NOT the gross principal
  assert.strictEqual(approved.fields.platform_fee, '10000')
  assert.strictEqual(approved.fields.creator, CREATOR)
  assert.strictEqual(approved.actor, `${CHAIN_ID}:${CREATOR}`)
})

test('decodeEscrowLogs: DisputeResolved winner code becomes the cross-chain NAME', () => {
  const [resolved] = decodeEscrowLogs([resolvedLog()], [CONTRACT], CHAIN_ID)
  assert.strictEqual(resolved.fields.winner, 'split') // uint8 2 → 'split', matches Solana
  assert.strictEqual(resolved.fields.creator_payout, '500000')
  assert.strictEqual(resolved.fields.counterparty_payout, '500000')
  assert.strictEqual(resolved.fields.platform_fee, '0')
  assert.strictEqual(resolved.fields.bond_amount, '100000')
})

// The seam that makes tx history honest on EVM: the approve row's amount_raw
// must be the event's NET payout and platform_fee_raw the fee — the columns
// were NULL before the events carried them, so the UI fell back to gross.
test('decoded EVM EscrowApproved applies with net amount + fee + actor', async () => {
  const [approved] = decodeEscrowLogs([approvedLog()], [CONTRACT], CHAIN_ID)
  const txs: EscrowEventTransaction[] = []
  const store: EscrowEventStore = {
    async applyEvent({ transaction }) {
      txs.push(transaction)
      return { applied: true, passed_applicant_ids: [], revived_applicant_ids: [] }
    },
    async resolveUserByWallet(_ns, address) {
      return address === CREATOR ? 'user-creator' : null
    },
  }
  const r = await applyEscrowEvent({ store, chain_ns: 'eip155' }, approved, TX)

  assert.strictEqual(r.internal_event, 'escrow.approved')
  assert.strictEqual(txs[0].amount_raw, '990000')
  assert.strictEqual(txs[0].platform_fee_raw, '10000')
  assert.strictEqual(txs[0].actor_id, 'user-creator')
})

// ---------- verifyTx --------------------------------------------------------------

function receipt(overrides: Partial<EvmReceipt> = {}): EvmReceipt {
  return { status: 'success', block_number: 90n, logs: [acceptedLog()], ...overrides }
}

test('verifyTx: unknown receipt → not confirmed; young receipt → pending', async () => {
  const a1 = makeAdapter({ rpc: fakeRpc() })
  assert.deepStrictEqual(await a1.verifyTx(TX, {}), {
    confirmed: false,
    reason: 'receipt not found',
  })

  const a2 = makeAdapter({
    rpc: fakeRpc({
      getTransactionReceipt: async () => receipt({ block_number: 98n }), // 2 confs < 5
    }),
  })
  const r = await a2.verifyTx(TX, {})
  assert.deepStrictEqual(r, { confirmed: false, pending: true, reason: 'awaiting confirmations' })
})

test('verifyTx: reverted tx is confirmed+failed; success decodes the expected event', async () => {
  const reverted = makeAdapter({
    rpc: fakeRpc({ getTransactionReceipt: async () => receipt({ status: 'reverted' }) }),
  })
  const r1 = await reverted.verifyTx(TX, {})
  assert.ok(r1.confirmed === true && r1.failed === true)

  const ok = makeAdapter({
    rpc: fakeRpc({ getTransactionReceipt: async () => receipt() }),
  })
  const r2 = await ok.verifyTx(TX, { expected_event: 'EscrowAccepted', escrow_id: UUID })
  assert.ok(r2.confirmed === true && r2.failed === false)
  assert.strictEqual(r2.event.name, 'EscrowAccepted')

  const wrongEvent = await ok.verifyTx(TX, { expected_event: 'EscrowApproved' })
  assert.ok(wrongEvent.confirmed === true && wrongEvent.failed === true)

  const wrongId = await ok.verifyTx(TX, {
    expected_event: 'EscrowAccepted',
    escrow_id: '00000000-0000-4000-8000-000000000000',
  })
  assert.ok(wrongId.confirmed === true && wrongId.failed === true)
})

// ---------- fetchEscrowState ---------------------------------------------------------

test('fetchEscrowState maps the tuple, zero-address sentinels and status enum', async () => {
  const adapter = makeAdapter({
    rpc: fakeRpc({
      readEscrow: async () => ({
        escrow_id: UUID_HEX,
        kind: 1,
        asset: ZERO_ADDRESS as `0x${string}`,
        amount: 5_000n,
        creator: CREATOR as `0x${string}`,
        counterparty: WORKER as `0x${string}`,
        assigned_counterparty: ZERO_ADDRESS as `0x${string}`,
        status: 2,
        accept_deadline: 1_900_000_000n,
        completion_duration: 7_200n,
        completion_deadline: 1_900_007_200n,
        approval_deadline: 1_900_010_000n,
        dispute_bond: 50n,
        is_seeker: true,
        raised_by: ZERO_ADDRESS as `0x${string}`,
        requires_approval: false,
        unassign_window_seconds: 0n,
      }),
    }),
  })
  const state = await adapter.fetchEscrowState(UUID_HEX)
  assert.ok(state !== null)
  assert.strictEqual(state.escrow_id, UUID)
  assert.strictEqual(state.kind, 'exchange')
  assert.strictEqual(state.asset_address, null)
  assert.strictEqual(state.counterparty_address, WORKER)
  assert.strictEqual(state.assigned_counterparty_address, null)
  assert.strictEqual(state.status, 'submitted')
  assert.strictEqual(state.amount_raw, '5000')
  assert.strictEqual(state.is_seeker, true)

  const missing = makeAdapter({ rpc: fakeRpc() })
  assert.strictEqual(await missing.fetchEscrowState(UUID_HEX), null)
})

// ---------- auth sig ---------------------------------------------------------------

test('verifyAuthSig: EOA personal_sign verifies; wrong address and garbage fail', async () => {
  const account = privateKeyToAccount(`0x${'07'.repeat(32)}`)
  const message = 'Tenda wants you to sign in with your wallet:\n0xabc\n\nNonce: n1'
  const signature = await account.signMessage({ message })

  const adapter = makeAdapter()
  assert.strictEqual(
    await adapter.verifyAuthSig({ address: account.address, message, signature }),
    true,
  )
  assert.strictEqual(
    await adapter.verifyAuthSig({ address: CREATOR, message, signature }),
    false,
  )
  assert.strictEqual(
    await adapter.verifyAuthSig({ address: account.address, message, signature: '0xdead' }),
    false,
  )
})

// ---------- sponsorship ----------------------------------------------------------------

test('buildTx: sponsorship path returns a userop skeleton with paymaster fields', async () => {
  const sponsorCalls: string[] = []
  const paymaster: PaymasterHttp = {
    async sponsorUserOperation(op) {
      sponsorCalls.push(String(op.sender))
      return {
        paymaster_and_data: '0xfeed',
        pre_verification_gas: '0x1',
        verification_gas_limit: '0x2',
        call_gas_limit: '0x3',
      }
    },
  }
  const adapter = makeAdapter({ paymaster, shouldSponsor: async () => true })
  const tx = await adapter.buildTx({
    action: 'acceptEscrow',
    user_id: 'u1',
    payload: { escrow_id: UUID },
  })
  assert.strictEqual(tx.kind, 'evm-userop')
  if (tx.kind === 'evm-userop') {
    assert.strictEqual(tx.user_op.sender, CREATOR)
    assert.strictEqual(tx.user_op.paymaster_and_data, '0xfeed')
  }
  assert.deepStrictEqual(sponsorCalls, [CREATOR])
})

test('buildTx: no quota / value-carrying / paymaster failure all degrade to a plain tx', async () => {
  // Quota exhausted.
  const noQuota = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('should not be called')
      },
    },
    shouldSponsor: async () => false,
  })
  const t1 = await noQuota.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(t1.kind, 'evm-tx')

  // Native value (paymasters can't fund msg.value).
  const valueCarrying = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('should not be called')
      },
    },
    shouldSponsor: async () => true,
  })
  const t2 = await valueCarrying.buildTx({
    ...CREATE_ARGS,
    payload: { ...CREATE_ARGS.payload, asset: 'ETH_BASE' },
  })
  assert.strictEqual(t2.kind, 'evm-tx')
  if (t2.kind === 'evm-tx') assert.strictEqual(t2.value, '1000000')

  // Paymaster outage → documented degradation.
  const flaky = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('rate limited')
      },
    },
    shouldSponsor: async () => true,
  })
  const t3 = await flaky.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(t3.kind, 'evm-tx')
})

// ADVERSARIAL: a sponsored build that fails AFTER the quota slot is reserved
// must release the slot, else it leaks (user loses a free tx yet pays gas).
// We model the real per-user counter: shouldSponsor reserves (decrement-if-
// positive), releaseSponsorship refunds. The pre-fix adapter never released
// on the degradation path, so the counter stays stuck below its start —
// these fail against it.
function quotaDeps(start: number): {
  remaining: () => number
  shouldSponsor: (user_id: string) => Promise<boolean>
  releaseSponsorship: (user_id: string) => Promise<void>
} {
  let remaining = start
  return {
    remaining: () => remaining,
    async shouldSponsor() {
      if (remaining <= 0) return false
      remaining -= 1
      return true
    },
    async releaseSponsorship() {
      remaining += 1
    },
  }
}

test('buildTx: paymaster outage refunds the reserved quota slot (no leak)', async () => {
  const quota = quotaDeps(3)
  const adapter = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('rate limited')
      },
    },
    shouldSponsor: quota.shouldSponsor,
    releaseSponsorship: quota.releaseSponsorship,
  })
  const tx = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(tx.kind, 'evm-tx') // degraded
  assert.strictEqual(quota.remaining(), 3) // reserved then released — net zero
})

test('buildTx: wallet-resolution failure after reserve also refunds the slot', async () => {
  const quota = quotaDeps(1)
  const adapter = makeAdapter({
    resolveWalletAddress: async () => {
      throw new Error('no wallet linked')
    },
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('should not reach the paymaster')
      },
    },
    shouldSponsor: quota.shouldSponsor,
    releaseSponsorship: quota.releaseSponsorship,
  })
  const tx = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(tx.kind, 'evm-tx') // degraded, did not throw
  assert.strictEqual(quota.remaining(), 1) // slot restored
})

test('buildTx: successful sponsorship KEEPS the reserved slot (decrement is the commit)', async () => {
  const quota = quotaDeps(2)
  const adapter = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        return {
          paymaster_and_data: '0xfeed',
          pre_verification_gas: '0x1',
          verification_gas_limit: '0x2',
          call_gas_limit: '0x3',
        }
      },
    },
    shouldSponsor: quota.shouldSponsor,
    releaseSponsorship: quota.releaseSponsorship,
  })
  const tx = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(tx.kind, 'evm-userop')
  assert.strictEqual(quota.remaining(), 1) // one slot spent, not refunded
})

test('buildTx: a refund hiccup never turns degradation into a hard failure', async () => {
  const adapter = makeAdapter({
    paymaster: {
      async sponsorUserOperation() {
        throw new Error('rate limited')
      },
    },
    shouldSponsor: async () => true,
    releaseSponsorship: async () => {
      throw new Error('db down')
    },
  })
  // Must still resolve to a plain tx — the build must not propagate the
  // refund error.
  const tx = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(tx.kind, 'evm-tx')
})

// ---------- approval hint (ERC-20 prerequisite on plain calls) ---------------

test('buildTx: plain ERC-20 create carries the approval hint; permit and native do not', async () => {
  const adapter = makeAdapter()
  const plain = await adapter.buildTx(CREATE_ARGS)
  assert.strictEqual(plain.kind, 'evm-tx')
  if (plain.kind === 'evm-tx') {
    assert.deepStrictEqual(plain.approval, { token: USDC, spender: CONTRACT, amount_raw: '1000000' })
  }

  const withPermit = await adapter.buildTx({
    ...CREATE_ARGS,
    payload: { ...CREATE_ARGS.payload, permit: PERMIT_BODY },
  })
  if (withPermit.kind === 'evm-tx') {
    assert.strictEqual('approval' in withPermit, false)
    const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: withPermit.data })
    assert.strictEqual(decoded.functionName, 'createEscrowWithPermit')
  }

  const native = await adapter.buildTx({
    ...CREATE_ARGS,
    payload: { ...CREATE_ARGS.payload, asset: 'ETH_BASE' },
  })
  if (native.kind === 'evm-tx') assert.strictEqual('approval' in native, false)
})

test('buildTx: ERC-20 dispute bond carries the approval hint; zero bond does not', async () => {
  const erc20Escrow = {
    escrow_id: UUID_HEX as `0x${string}`,
    kind: 0,
    asset: USDC as `0x${string}`,
    amount: 1_000_000n,
    creator: CREATOR as `0x${string}`,
    counterparty: WORKER as `0x${string}`,
    assigned_counterparty: ZERO_ADDRESS as `0x${string}`,
    status: 1,
    accept_deadline: 1_900_000_000n,
    completion_duration: 7_200n,
    completion_deadline: 0n,
    approval_deadline: 0n,
    dispute_bond: 777n,
    is_seeker: false,
    raised_by: ZERO_ADDRESS as `0x${string}`,
    requires_approval: false,
    unassign_window_seconds: 0n,
  }
  const adapter = makeAdapter({ rpc: fakeRpc({ readEscrow: async () => erc20Escrow }) })
  const withBond = await adapter.buildTx({
    action: 'disputeEscrow',
    user_id: 'u1',
    payload: { escrow_id: UUID, bond_raw: '777' },
  })
  if (withBond.kind === 'evm-tx') {
    assert.deepStrictEqual(withBond.approval, { token: USDC, spender: CONTRACT, amount_raw: '777' })
  }

  const zeroBond = await adapter.buildTx({
    action: 'disputeEscrow',
    user_id: 'u1',
    payload: { escrow_id: UUID, bond_raw: '0' },
  })
  if (zeroBond.kind === 'evm-tx') assert.strictEqual('approval' in zeroBond, false)
})

test('buildTx disputeEscrow: a NATIVE escrow still prices the bond in the gas token', async () => {
  // The distinction the absent-escrow guard turns on, and the way to get that
  // guard wrong: `state === null` (contract has no such escrow → refuse) is
  // NOT the same as `state.asset_address === null` (a real escrow denominated
  // in the native token → build, with no ERC-20 approval). A guard that
  // conflated them would break every native dispute.
  const nativeEscrow = {
    escrow_id: UUID_HEX as `0x${string}`,
    kind: 0,
    asset: ZERO_ADDRESS as `0x${string}`, // native
    amount: 1_000_000n,
    creator: CREATOR as `0x${string}`,
    counterparty: WORKER as `0x${string}`,
    assigned_counterparty: ZERO_ADDRESS as `0x${string}`,
    status: 1,
    accept_deadline: 1_900_000_000n,
    completion_duration: 7_200n,
    completion_deadline: 0n,
    approval_deadline: 0n,
    dispute_bond: 777n,
    is_seeker: false,
    raised_by: ZERO_ADDRESS as `0x${string}`,
    requires_approval: false,
    unassign_window_seconds: 0n,
  }
  const adapter = makeAdapter({ rpc: fakeRpc({ readEscrow: async () => nativeEscrow }) })
  const tx = await adapter.buildTx({
    action: 'disputeEscrow',
    user_id: 'u1',
    payload: { escrow_id: UUID, bond_raw: '777' },
  })
  assert.strictEqual(tx.kind, 'evm-tx')
  if (tx.kind === 'evm-tx') {
    // Native bond rides as tx value, so there is nothing to approve.
    assert.strictEqual('approval' in tx, false)
    assert.strictEqual(tx.value, '777')
  }
})

test('buildTx disputeEscrow: an escrow absent from THIS contract is refused, not priced as native', async () => {
  // readEscrow → null means the configured contract has no such escrow. The
  // old code did `state?.asset_address ?? null`, and null means NATIVE — so a
  // stranded escrow (open_issues #89) silently denominated the dispute bond in
  // the gas token instead of its ERC-20, and the approval step vanished with
  // it. Absence must refuse.
  const adapter = makeAdapter({ rpc: fakeRpc({ readEscrow: async () => null }) })
  await adapter
    .buildTx({
      action: 'disputeEscrow',
      user_id: 'u1',
      payload: { escrow_id: UUID, bond_raw: '777' },
    })
    .then(
      () => assert.fail('expected the build to be refused'),
      (err) => {
        assert.ok(err instanceof AppError)
        assert.strictEqual(err.statusCode, 422)
        assert.strictEqual(err.code, 'ESCROW_NOT_FUNDED')
        // Name the contract actually consulted, or the operator cannot tell
        // a genuinely-missing escrow from a stranded one.
        assert.match(err.message, new RegExp(CONTRACT, 'i'))
      },
    )
})

// ---------- buildPermitPayload ------------------------------------------------

/** Live-matching fixture: separator computed from the domain the adapter builds. */
function matchingSeparator(chainId: number, token: string): `0x${string}` {
  return hashDomain({
    domain: { name: 'USDC', version: '2', chainId: BigInt(chainId), verifyingContract: token as `0x${string}` },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
    },
  })
}

test('buildPermitPayload: happy path builds verifiable typed data with the live nonce', async () => {
  const adapter = makeAdapter({
    verifyWalletOwnership: async (user, address) => user === 'u1' && address === CREATOR,
    rpc: fakeRpc({
      readPermitFacts: async () => ({
        name: 'USDC',
        nonce: 7n,
        domain_separator: matchingSeparator(8453, USDC),
      }),
    }),
  })
  assert.ok(adapter.buildPermitPayload)
  const res = await adapter.buildPermitPayload({
    user_id: 'u1',
    owner: CREATOR,
    asset: 'USDC_BASE',
    value_raw: '1000000',
  })
  assert.strictEqual(res.typed_data.domain.name, 'USDC')
  assert.strictEqual(res.typed_data.domain.version, '2')
  assert.strictEqual(res.typed_data.domain.chainId, 8453)
  assert.strictEqual(res.typed_data.domain.verifyingContract, USDC)
  assert.strictEqual(res.typed_data.message.owner, CREATOR)
  assert.strictEqual(res.typed_data.message.spender, CONTRACT)
  assert.strictEqual(res.typed_data.message.value, '1000000')
  assert.strictEqual(res.typed_data.message.nonce, '7')
  assert.strictEqual(res.value_raw, '1000000')
  assert.ok(res.deadline_unix > Math.floor(Date.now() / 1000))
  assert.strictEqual(Number(res.typed_data.message.deadline), res.deadline_unix)
})

test('buildPermitPayload: negatives — ownership, capability, domain mismatch, bad inputs', async () => {
  const owned = async () => true
  const goodFacts = fakeRpc({
    readPermitFacts: async () => ({
      name: 'USDC',
      nonce: 0n,
      domain_separator: matchingSeparator(8453, USDC),
    }),
  })

  // owner not a linked wallet → 422 (never leaks whether the wallet exists)
  const notOwned = makeAdapter({ verifyWalletOwnership: async () => false, rpc: goodFacts })
  await assert.rejects(
    notOwned.buildPermitPayload!({ user_id: 'u1', owner: CREATOR, asset: 'USDC_BASE', value_raw: '1' }),
    /not one of your verified linked wallets/,
  )

  // no ownership dep at all → same rejection (fail closed)
  const noDep = makeAdapter({ rpc: goodFacts })
  await assert.rejects(
    noDep.buildPermitPayload!({ user_id: 'u1', owner: CREATOR, asset: 'USDC_BASE', value_raw: '1' }),
    /not one of your verified linked wallets/,
  )

  // native asset / no manifest permit entry → PERMIT_UNAVAILABLE
  const adapter = makeAdapter({ verifyWalletOwnership: owned, rpc: goodFacts })
  await assert.rejects(
    adapter.buildPermitPayload!({ user_id: 'u1', owner: CREATOR, asset: 'ETH_BASE', value_raw: '1' }),
    (err: { code?: string }) => err.code === 'PERMIT_UNAVAILABLE',
  )

  // live domain mismatch (token renamed/upgraded) → PERMIT_UNAVAILABLE
  const mismatched = makeAdapter({ verifyWalletOwnership: owned }) // default facts: zero separator
  await assert.rejects(
    mismatched.buildPermitPayload!({ user_id: 'u1', owner: CREATOR, asset: 'USDC_BASE', value_raw: '1' }),
    (err: { code?: string; message: string }) =>
      err.code === 'PERMIT_UNAVAILABLE' && /domain mismatch/.test(err.message),
  )

  // malformed owner / value
  await assert.rejects(
    adapter.buildPermitPayload!({ user_id: 'u1', owner: 'not-an-address', asset: 'USDC_BASE', value_raw: '1' }),
    /0x-hex EVM address/,
  )
  await assert.rejects(
    adapter.buildPermitPayload!({ user_id: 'u1', owner: CREATOR, asset: 'USDC_BASE', value_raw: '0' }),
    /positive canonical integer/,
  )
})

// ---------- alchemy webhook extraction ------------------------------------------------------

test('extractTxHashes: dedupes valid hashes, ignores junk shapes', () => {
  const hash = `0x${'cd'.repeat(32)}`
  const payload = {
    event: {
      activity: [
        { hash },
        { hash }, // duplicate
        { hash: 'not-a-hash' },
        { nope: true },
      ],
    },
  }
  assert.deepStrictEqual(extractTxHashes(payload), [hash])
  assert.deepStrictEqual(extractTxHashes(null), [])
  assert.deepStrictEqual(extractTxHashes({ event: {} }), [])
})

test('fee_currency (CELO): plain txs carry it; a BASE adapter never does', async () => {
  // CELO pays gas in USDC via the FeeCurrencyDirectory adapter (6→18-decimal
  // wrapper) — the tx carries the ADAPTER, not the raw USDC token. This proves
  // the adapter passes whatever fee_currency it's built with straight through.
  const USDC_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const
  const celo = evmAdapter({
    chain_id: 'eip155:42220',
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 3,
    fee_currency: USDC_ADAPTER,
    deps: {
      resolveWalletAddress: async () => CREATOR,
      resolveAsset: async () => ({ token_address: null }),
      rpc: fakeRpc(),
    },
  })
  const tx = await celo.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  assert.strictEqual(tx.kind, 'evm-tx')
  if (tx.kind === 'evm-tx') assert.strictEqual(tx.fee_currency, USDC_ADAPTER)

  // BASE adapter (no fee_currency arg) must not grow the field.
  const base = makeAdapter()
  const baseTx = await base.buildTx({ action: 'acceptEscrow', user_id: 'u1', payload: { escrow_id: UUID } })
  if (baseTx.kind === 'evm-tx') assert.strictEqual('fee_currency' in baseTx, false)
})

// ---------- approval-mode events (stage 10) --------------------------------

function assignedLog() {
  // CounterpartyAssigned(bytes16 indexed, address indexed counterparty,
  //                      address indexed assigned_by, uint64 completion_deadline)
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'CounterpartyAssigned',
    args: { escrowId: UUID_HEX, counterparty: WORKER, assigned_by: CREATOR },
  })
  const data = encodeAbiParameters([{ type: 'uint64' }], [1_900_007_200n])
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data }
}

function releasedLog() {
  // AssignmentReleased(bytes16 indexed, address indexed counterparty,
  //                    address indexed released_by) — all args indexed, no data
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'AssignmentReleased',
    args: { escrowId: UUID_HEX, counterparty: WORKER, released_by: CREATOR },
  })
  return { address: CONTRACT, topics: [...topics] as `0x${string}`[], data: '0x' as `0x${string}` }
}

test('decodeEscrowLogs: CounterpartyAssigned attributes the actor to the CREATOR, not the worker', () => {
  const [e] = decodeEscrowLogs([assignedLog()], [CONTRACT], CHAIN_ID)
  assert.strictEqual(e.name, 'CounterpartyAssigned')
  assert.strictEqual(e.fields.escrow_id, UUID)
  assert.strictEqual(e.fields.counterparty, WORKER)
  // The poster signed this transaction; labelling it with the worker would put
  // "Gig accepted" in the wrong wallet history.
  assert.strictEqual(e.actor, `${CHAIN_ID}:${CREATOR}`)
  assert.strictEqual(e.fields.completion_deadline, '1900007200')
})

test('decodeEscrowLogs: AssignmentReleased decodes with the creator as actor', () => {
  const [e] = decodeEscrowLogs([releasedLog()], [CONTRACT], CHAIN_ID)
  assert.strictEqual(e.name, 'AssignmentReleased')
  assert.strictEqual(e.fields.counterparty, WORKER)
  assert.strictEqual(e.actor, `${CHAIN_ID}:${CREATOR}`)
})

// The EVM actor table used to be a nested ternary that fell through to null,
// so a newly added event silently produced escrow_transactions rows with no
// actor. It is now an exhaustive Record; this pins that every event the
// contract can emit resolves to a decision (an address, or a deliberate null).
test('decodeEscrowLogs: every wire event with a party arg resolves an actor', () => {
  const withParty: Array<[string, () => { address: string; topics: `0x${string}`[]; data: `0x${string}` }]> = [
    ['EscrowCreated', createdLog],
    ['EscrowAccepted', acceptedLog],
    ['CounterpartyAssigned', assignedLog],
    ['AssignmentReleased', releasedLog],
  ]
  for (const [name, build] of withParty) {
    const [e] = decodeEscrowLogs([build()], [CONTRACT], CHAIN_ID)
    assert.strictEqual(e.name, name)
    assert.ok(e.actor !== undefined, `${name} decoded without an actor`)
  }
})

// THE claim behind "the listeners need no change for new events": neither
// poller nor webhook filters by topic — they answer "which transactions
// touched the contract?" and enqueue verify-tx with NO expected_event. Event
// selection happens here, on the wide-net path, against ESCROW_EVENTS. So a
// receipt whose only escrow log is a Stage-10 event must still decode. If it
// did not, the DB would converge only when the client happened to ping.
test('verifyTx (wide net, as polling/webhook enqueue it): a new event decodes with no hint', async () => {
  const a = makeAdapter({
    rpc: fakeRpc({
      getTransactionReceipt: async () => receipt({ logs: [assignedLog()] }),
    }),
  })
  const r = await a.verifyTx(TX, {}) // exactly what source:'polling' produces
  assert.ok(r.confirmed === true && r.failed === false)
  assert.strictEqual(r.event.name, 'CounterpartyAssigned')
  assert.strictEqual(r.event.fields.escrow_id, UUID)
})

test('verifyTx (wide net): an unassign receipt decodes with no hint', async () => {
  const a = makeAdapter({
    rpc: fakeRpc({
      getTransactionReceipt: async () => receipt({ logs: [releasedLog()] }),
    }),
  })
  const r = await a.verifyTx(TX, {})
  assert.ok(r.confirmed === true && r.failed === false)
  assert.strictEqual(r.event.name, 'AssignmentReleased')
})
