/**
 * EVM receipt verification across contract GENERATIONS (open_issues #89).
 *
 * The defect these pin: `decodeEscrowLogs` used to filter on the single
 * configured contract, so a transaction against a superseded one decoded to
 * nothing, `verifyTx` reported that as a FAILED transaction, and `verify-tx`
 * wrote `TX_FAILED` against an attempt that had in fact succeeded on chain.
 * Terminal, unretried, and a permanent lie in the database — the DB and the
 * chain disagreeing forever about where the money went.
 *
 * Each test here fails against the pre-fix tree.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { decodeEscrowLogs } from '@server/chains/evm/verify'
import { verifyEvmReceipt } from '@server/chains/evm/verify-receipt'

const CHAIN_ID = 'eip155:84532'
/** Two generations of the same escrow contract on one chain. */
const CURRENT = '0x00000000000000000000000000000000000000bb' as const
const PREVIOUS = '0x00000000000000000000000000000000000000aa' as const
const STRANGER = '0x00000000000000000000000000000000000000cc' as const

const UUID = '11111111-2222-4333-8444-555555555555'
const UUID_HEX = `0x${UUID.replace(/-/g, '')}` as const
const CREATOR = '0x1111111111111111111111111111111111111111' as const
const USDC = '0x2222222222222222222222222222222222222222' as const

function createdLog(address: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowCreated',
    args: { escrowId: UUID_HEX, creator: CREATOR },
  })
  const data = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'address' }, { type: 'uint256' }],
    [0, USDC, 1_000_000n],
  )
  return { address, topics: [...topics] as `0x${string}`[], data }
}

/** An ERC-20 Transfer-shaped log from an unrelated contract. */
const noiseLog = {
  address: STRANGER,
  topics: [`0x${'11'.repeat(32)}`] as `0x${string}`[],
  data: '0x' as `0x${string}`,
}

function rpc(logs: ReturnType<typeof createdLog>[], opts: { status?: 'success' | 'reverted' } = {}) {
  return {
    async getTransactionReceipt() {
      return {
        block_number: 100n,
        status: opts.status ?? ('success' as const),
        logs,
      }
    },
    async getBlockNumber() {
      return 200n
    },
  }
}

const deps = (contracts: readonly string[], logs: ReturnType<typeof createdLog>[]) => ({
  rpc: rpc(logs),
  chain_id: CHAIN_ID,
  escrow_contracts: contracts,
  min_confirmations: 1,
})

// ---------- decode across generations ---------------------------------------

test('decode: a log from a PREVIOUS contract decodes when that contract is known', () => {
  const [event] = decodeEscrowLogs([createdLog(PREVIOUS)], [CURRENT, PREVIOUS], CHAIN_ID)
  assert.ok(event !== undefined, 'a known previous contract must still decode')
  assert.strictEqual(event.name, 'EscrowCreated')
  assert.strictEqual(event.fields.escrow_id, UUID)
})

test('decode: the event reports WHICH contract emitted it', () => {
  // This is what stamps escrows.escrow_contract, so it must be the emitter and
  // not the configured contract — otherwise the stamp records an intention.
  const [event] = decodeEscrowLogs([createdLog(PREVIOUS)], [CURRENT, PREVIOUS], CHAIN_ID)
  assert.strictEqual(event.contract, PREVIOUS)
})

test('decode: an UNKNOWN contract is still skipped — the set is an allow-list', () => {
  // Widening must not become "decode anything matching our ABI": a look-alike
  // contract could otherwise write events onto our escrows.
  const events = decodeEscrowLogs([createdLog(STRANGER)], [CURRENT, PREVIOUS], CHAIN_ID)
  assert.deepStrictEqual(events, [])
})

test('decode: mixed receipt keeps ours (both generations) and drops the rest', () => {
  const events = decodeEscrowLogs(
    [noiseLog, createdLog(PREVIOUS), createdLog(CURRENT)],
    [CURRENT, PREVIOUS],
    CHAIN_ID,
  )
  assert.deepStrictEqual(events.map((e) => e.contract), [PREVIOUS, CURRENT])
})

// ---------- verifyTx: the C1/C2 regression ---------------------------------

test('verifyTx: a PREVIOUS-contract tx verifies instead of being marked failed', async () => {
  // The headline regression. Pre-fix this returned
  // { failed: true, reason: 'expected event ... not found' } and the attempt was
  // recorded TX_FAILED.
  const result = await verifyEvmReceipt(
    deps([CURRENT, PREVIOUS], [createdLog(PREVIOUS)]),
    `0x${'ab'.repeat(32)}`,
    { expected_event: 'EscrowCreated' },
  )
  assert.strictEqual(result.confirmed, true)
  assert.strictEqual('failed' in result ? result.failed : undefined, false)
  assert.strictEqual('event' in result ? result.event.contract : undefined, PREVIOUS)
})

test('verifyTx: a genuinely-missing expected event is STILL a failure', async () => {
  // The other half of G2. Widening `irrelevant` to this path would silently stop
  // real client-pinged failures from ever being marked — a worse bug than the
  // one being fixed, and invisible.
  const result = await verifyEvmReceipt(
    deps([CURRENT, PREVIOUS], [noiseLog]),
    `0x${'ab'.repeat(32)}`,
    { expected_event: 'EscrowCreated' },
  )
  assert.strictEqual(result.confirmed, true)
  assert.strictEqual('failed' in result ? result.failed : undefined, true)
})

test('verifyTx: wide-net with no escrow log is IRRELEVANT, not failed', async () => {
  // The polling producer states no expectation and enqueues every tx touching a
  // watched contract. Recording those as failures would pollute tx_attempts with
  // transactions no user submitted. Mirrors the Solana verifier.
  const result = await verifyEvmReceipt(deps([CURRENT], [noiseLog]), `0x${'ab'.repeat(32)}`, {})
  assert.strictEqual(result.confirmed, true)
  assert.strictEqual('irrelevant' in result ? result.irrelevant : undefined, true)
  assert.strictEqual('failed' in result ? result.failed : undefined, undefined)
})

test('verifyTx: an unknown contract stays unverifiable even wide-net', async () => {
  const result = await verifyEvmReceipt(
    deps([CURRENT], [createdLog(STRANGER)]),
    `0x${'ab'.repeat(32)}`,
    {},
  )
  assert.strictEqual('irrelevant' in result ? result.irrelevant : undefined, true)
})

test('verifyTx: a reverted receipt is failed regardless of the contract set', async () => {
  const result = await verifyEvmReceipt(
    { ...deps([CURRENT, PREVIOUS], []), rpc: rpc([], { status: 'reverted' }) },
    `0x${'ab'.repeat(32)}`,
    { expected_event: 'EscrowCreated' },
  )
  assert.strictEqual('failed' in result ? result.failed : undefined, true)
  assert.match('reason' in result ? (result.reason ?? '') : '', /reverted/)
})

test('verifyTx: an escrow_id hint that disagrees with the event is a failure', async () => {
  const result = await verifyEvmReceipt(
    deps([CURRENT, PREVIOUS], [createdLog(PREVIOUS)]),
    `0x${'ab'.repeat(32)}`,
    { expected_event: 'EscrowCreated', escrow_id: '99999999-2222-4333-8444-555555555555' },
  )
  assert.strictEqual('failed' in result ? result.failed : undefined, true)
})

// ---------- permit vs approval pairing (open_issues #89, C5) ----------------

/**
 * The invariant: for an ERC-20 pull, a build emits EITHER a `*WithPermit` call
 * (allowance rides the tx) OR an `approval` hint (the wallet grants it first).
 * Never neither — that is a guaranteed revert on a zero allowance — and the two
 * decisions are made in different files (`builders.ts` encodes, `index.ts`
 * hints), so they are pinned together here.
 *
 * A permit's spender is minted for the CURRENT contract, so against a superseded
 * one it cannot be encoded and the hint must take over.
 */

import { evmAdapter } from '@server/chains/evm'

// r ‖ s ‖ v, with v = 0x1b (27). The value is never verified on-chain here, but
// it must PARSE — viem rejects an out-of-range v, and a signature that cannot be
// parsed would make the "permit was encoded" assertion pass for the wrong reason.
const PERMIT = {
  value_raw: '25000000',
  deadline_unix: 9_999_999_999,
  signature: `0x${'ab'.repeat(32)}${'cd'.repeat(32)}1b`,
}
const TOKEN = '0x3333333333333333333333333333333333333333'

function adapterFor(current: `0x${string}`) {
  return evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: current,
    escrow_contracts: [CURRENT, PREVIOUS],
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => CREATOR,
      resolveAsset: async () => ({ token_address: TOKEN }),
      rpc: {
        async getTransactionReceipt() {
          return null
        },
        async getBlockNumber() {
          return 1n
        },
        async getLogRefs() {
          return []
        },
        async readEscrow() {
          return null
        },
        async readPermitFacts() {
          throw new Error('not used')
        },
      },
    },
  })
}

const createBuild = (contract?: string) => ({
  action: 'createEscrow' as const,
  user_id: 'u1',
  ...(contract !== undefined ? { contract } : {}),
  payload: {
    escrow_id: UUID,
    kind: 'gig' as const,
    asset: 'USDC_BASE',
    amount_raw: '25000000',
    accept_deadline_unix: 9_999_999_999,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
    permit: PERMIT,
  },
})

test('create with a permit against the CURRENT contract: permit encoded, no hint', async () => {
  const unsigned = await adapterFor(CURRENT).buildTx(createBuild())
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') return
  assert.strictEqual(unsigned.approval, undefined, 'the allowance rides the permit')
  assert.strictEqual(unsigned.to, CURRENT)
})

test('create with a permit against a PREVIOUS contract: hint takes over, never neither', async () => {
  // Pre-fix for this branch, `approvalHint` keyed off "the caller supplied a
  // permit" while the builder keyed off "the permit is encodable" — so this
  // build produced a plain call with NO allowance and no instruction to grant
  // one, which reverts.
  const unsigned = await adapterFor(CURRENT).buildTx(createBuild(PREVIOUS))
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') return
  assert.strictEqual(unsigned.to, PREVIOUS)
  assert.deepStrictEqual(unsigned.approval, {
    token: TOKEN,
    spender: PREVIOUS,
    amount_raw: '25000000',
  })
})

test('create with no permit always carries the hint, spender = the escrow’s contract', async () => {
  const build = createBuild(PREVIOUS)
  const { permit: _dropped, ...payload } = build.payload
  const unsigned = await adapterFor(CURRENT).buildTx({ ...build, payload })
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') return
  assert.strictEqual(unsigned.approval?.spender, PREVIOUS)
})

test('the known set dedupes across casings, not just across duplicates', async () => {
  // The two inputs arrive from different places: the chain secret (usually
  // checksummed deploy output) and the registry (normalised). Compared raw, one
  // contract would occupy two slots — harmless for decoding, but the kind of
  // quiet inconsistency that makes a later membership check wrong.
  const checksummed = '0x00000000000000000000000000000000000000Bb' as const
  const adapter = evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://unused.invalid',
    escrow_contract: checksummed,
    escrow_contracts: [CURRENT], // the same contract, lower-cased
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => CREATOR,
      resolveAsset: async () => ({ token_address: null }),
      rpc: {
        async getTransactionReceipt() {
          return { block_number: 1n, status: 'success' as const, logs: [createdLog(CURRENT)] }
        },
        async getBlockNumber() {
          return 10n
        },
        async getLogRefs() {
          return []
        },
        async readEscrow() {
          return null
        },
        async readPermitFacts() {
          throw new Error('not used')
        },
      },
    },
  })

  const verified = await adapter.verifyTx(`0x${'ab'.repeat(32)}`, { expected_event: 'EscrowCreated' })
  assert.strictEqual('failed' in verified ? verified.failed : undefined, false)
  // Whatever casing came in, the attested stamp is the canonical one.
  assert.strictEqual('event' in verified ? verified.event.contract : undefined, CURRENT)
})
