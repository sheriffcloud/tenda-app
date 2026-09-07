/**
 * chains/solana adapter — full Stage 0 surface (#29).
 *
 * Offline per testing-strategy.md: all network I/O goes through
 * `fakeSolanaRpc`; fixtures encode with the adapter's own coder.
 *
 * Covered: buildTx for every action (instruction selection, SOL/SPL
 * forking, PDA + ATA account wiring, payload validation), verifyTx
 * (pending / failed / decoded-event / hint-mismatch), fetchEscrowState
 * mapping, verifyAuthSig round-trips, computeFee delegation.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { BN } from '@coral-xyz/anchor'
import { SystemProgram, VersionedTransaction } from '@solana/web3.js'
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { discriminatorFor, type InstructionName } from '@tenda/shared/idl'
import { AppError } from '@server/lib/errors'
import { solanaAdapter, verifyEd25519 } from '@server/chains/solana'
import { ataProvisioningIx } from '@server/chains/solana/builder-internals'
import { escrowPdaFromUuid, platformPda, tokenVaultPda, vaultPda } from '@server/chains/solana/pdas'
import { uuidToBytes, bytesToUuid } from '@server/chains/ids'
import type { UnsignedTx } from '@server/chains/types'
import {
  COUNTERPARTY,
  CREATOR,
  TEST_BLOCKHASH,
  TEST_LAST_VALID_BLOCK_HEIGHT,
  TREASURY,
  USDC_MINT,
  encodeEscrowAccount,
  encodePlatformState,
  escrowAccountFixture,
  eventLogs,
  fakeSolanaRpc,
  platformStateFixture,
  type FakeSolanaRpc,
} from '../helpers/solana'

const CHAIN_ID = 'solana:devnet'
const ESCROW_UUID = '11111111-2222-4333-8444-555555555555'
const WALLETS: Record<string, string> = {
  'user-creator': CREATOR.toBase58(),
  'user-counterparty': COUNTERPARTY.toBase58(),
  'user-admin': '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1',
}
// The chain's configured dispute-resolution authority — the resolveDispute
// signer/fee-payer, passed in explicitly (NOT resolved from any user wallet).
const DISPUTE_AUTHORITY = '9n2vi3JQE5MzTeRyHA4SeGJRf536noeV4jaJWZ5q2Wu8'

function makeAdapter(rpc: FakeSolanaRpc, resolvedUserIds: string[] = []) {
  return solanaAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://127.0.0.1:8899',
    deps: {
      rpc,
      async resolveWalletAddress(user_id) {
        resolvedUserIds.push(user_id)
        const w = WALLETS[user_id]
        if (w === undefined) throw new AppError(404, 'USER_NOT_FOUND', `no wallet for ${user_id}`)
        return w
      },
      async resolveAsset(asset) {
        if (asset === 'SOL') return { token_address: null }
        if (asset === 'USDC_SOL') return { token_address: USDC_MINT.toBase58() }
        throw new AppError(422, 'ESCROW_INVALID_ASSET', `unknown asset ${asset}`)
      },
    },
  })
}

/** Decode an UnsignedTx and return its single instruction's parts. */
/**
 * Decode an unsigned tx. The action's own instruction is always last; any
 * instructions before it are idempotent ATA-provisioning creations (SPL
 * settlement/resolve). `ataOwners` lists the owner pubkey each provisioning
 * instruction targets (owner is account index 2 of the SPL ATA instruction).
 */
function decodeUnsigned(unsigned: UnsignedTx): {
  programId: string
  discriminator: Buffer
  keys: string[]
  payer: string
  instructionCount: number
  ataOwners: string[]
} {
  assert.strictEqual(unsigned.kind, 'solana-tx')
  if (unsigned.kind !== 'solana-tx') throw new Error('unreachable')
  assert.strictEqual(unsigned.recent_blockhash, TEST_BLOCKHASH)
  assert.strictEqual(unsigned.last_valid_block_height, TEST_LAST_VALID_BLOCK_HEIGHT)
  const tx = VersionedTransaction.deserialize(Buffer.from(unsigned.tx_base64, 'base64'))
  const msg = tx.message
  assert.ok(msg.compiledInstructions.length >= 1)
  const keys = msg.staticAccountKeys.map((k) => k.toBase58())
  const ixs = msg.compiledInstructions
  const ata = ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()
  const ataOwners = ixs
    .filter((ix) => keys[ix.programIdIndex] === ata)
    .map((ix) => keys[ix.accountKeyIndexes[2]])
  const main = ixs[ixs.length - 1]
  // Every non-final instruction must be an ATA provisioning instruction.
  for (const ix of ixs.slice(0, -1)) {
    assert.strictEqual(keys[ix.programIdIndex], ata, 'non-final instruction is not an ATA creation')
  }
  return {
    programId: keys[main.programIdIndex],
    discriminator: Buffer.from(main.data.slice(0, 8)),
    keys: main.accountKeyIndexes.map((i) => keys[i]),
    payer: keys[0],
    instructionCount: ixs.length,
    ataOwners,
  }
}

function expectDiscriminator(d: Buffer, instruction: InstructionName): void {
  assert.deepStrictEqual(Array.from(d), discriminatorFor(instruction), `expected ${instruction}`)
}

async function expectAppError(p: Promise<unknown>, status: number, code: string): Promise<void> {
  await p.then(
    () => assert.fail(`expected AppError ${code}`),
    (err) => {
      if (!(err instanceof AppError)) throw err
      assert.strictEqual(err.statusCode, status)
      assert.strictEqual(err.code, code)
    },
  )
}

async function stageAcceptedEscrow(
  rpc: FakeSolanaRpc,
  overrides: Parameters<typeof escrowAccountFixture>[0] = {},
): Promise<void> {
  rpc.stageAccount(
    escrowPdaFromUuid(ESCROW_UUID),
    await encodeEscrowAccount(escrowAccountFixture(overrides)),
  )
  rpc.stageAccount(platformPda(), await encodePlatformState(platformStateFixture()))
}

// ---------- buildTx: createEscrow ----------------------------------------

const CREATE_PAYLOAD = {
  escrow_id: ESCROW_UUID,
  kind: 'gig' as const,
  asset: 'SOL',
  amount_raw: '1000000000',
  accept_deadline_unix: 1_900_000_000,
  completion_duration_seconds: 7_200,
  dispute_bond_raw: '100000000',
  is_seeker: false,
  requires_approval: false,
  unassign_window_seconds: 0,
}

test('buildTx createEscrow (SOL): create_escrow_sol with escrow+vault PDAs, payer = creator wallet', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  const unsigned = await a.buildTx({
    action: 'createEscrow',
    user_id: 'user-creator',
    payload: CREATE_PAYLOAD,
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'createEscrowSol')
  assert.strictEqual(d.payer, CREATOR.toBase58())
  assert.ok(d.keys.includes(escrowPdaFromUuid(ESCROW_UUID).toBase58()))
  assert.ok(d.keys.includes(vaultPda(uuidToBytes(ESCROW_UUID)).toBase58()))
})

test('buildTx createEscrow (USDC): create_escrow_spl with token vault, mint and creator ATA', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  const unsigned = await a.buildTx({
    action: 'createEscrow',
    user_id: 'user-creator',
    payload: { ...CREATE_PAYLOAD, asset: 'USDC_SOL' },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'createEscrowSpl')
  assert.ok(d.keys.includes(tokenVaultPda(uuidToBytes(ESCROW_UUID)).toBase58()))
  assert.ok(d.keys.includes(USDC_MINT.toBase58()))
  assert.ok(d.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, CREATOR).toBase58()))
})

test('buildTx createEscrow: assigned counterparty resolves through the wallet resolver', async () => {
  const resolved: string[] = []
  const a = makeAdapter(fakeSolanaRpc(), resolved)
  await a.buildTx({
    action: 'createEscrow',
    user_id: 'user-creator',
    payload: { ...CREATE_PAYLOAD, assigned_counterparty_user_id: 'user-counterparty' },
  })
  assert.deepStrictEqual(resolved.sort(), ['user-counterparty', 'user-creator'])
})

test('buildTx createEscrow: non-canonical amount_raw → 422 VALIDATION_ERROR', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  await expectAppError(
    a.buildTx({
      action: 'createEscrow',
      user_id: 'user-creator',
      payload: { ...CREATE_PAYLOAD, amount_raw: '1.5' },
    }),
    422,
    'VALIDATION_ERROR',
  )
})

test('buildTx createEscrow: unknown asset rejects via resolver', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  await expectAppError(
    a.buildTx({
      action: 'createEscrow',
      user_id: 'user-creator',
      payload: { ...CREATE_PAYLOAD, asset: 'DOGE' },
    }),
    422,
    'ESCROW_INVALID_ASSET',
  )
})

// ---------- buildTx: state-machine + settlement ---------------------------

test('buildTx acceptEscrow: escrow + platform PDAs, signer wallet', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { open: {} }, counterparty: null })
  const a = makeAdapter(rpc)
  const unsigned = await a.buildTx({
    action: 'acceptEscrow',
    user_id: 'user-counterparty',
    payload: { escrow_id: ESCROW_UUID },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'acceptEscrow')
  assert.deepStrictEqual(d.keys.slice(0, 2), [
    escrowPdaFromUuid(ESCROW_UUID).toBase58(),
    platformPda().toBase58(),
  ])
  assert.strictEqual(d.payer, COUNTERPARTY.toBase58())
})

test('buildTx: a transition on a SUPERSEDED program\'s escrow is refused, not built', async () => {
  // The build path must be louder than the read path: this escrow decodes
  // fine, but the configured program cannot sign for an account it does not
  // own, so a built tx would revert on chain and burn the user's fee. 409 +
  // ESCROW_MISMATCH names the owning program instead. See open_issues #89.
  const rpc = fakeSolanaRpc()
  rpc.stageAccount(
    escrowPdaFromUuid(ESCROW_UUID),
    await encodeEscrowAccount(escrowAccountFixture({ status: { open: {} }, counterparty: null })),
    '996SiTqTBhydHAsTqt1vDn9sP5uW6Q9RUrc4ZdNcHyyv', // a real predecessor
  )
  rpc.stageAccount(platformPda(), await encodePlatformState(platformStateFixture()))
  await expectAppError(
    makeAdapter(rpc).buildTx({
      action: 'acceptEscrow',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID },
    }),
    409,
    'ESCROW_MISMATCH',
  )
})

test('buildTx: a superseded PLATFORM state is refused — fees would come from another deployment', async () => {
  // Settlement is the path that reads platform state (it prices the fee), so
  // it is the one where another deployment's fee_bps could be applied to a
  // real payout. `acceptEscrow` never reads it.
  const rpc = fakeSolanaRpc()
  rpc.stageAccount(
    escrowPdaFromUuid(ESCROW_UUID),
    await encodeEscrowAccount(escrowAccountFixture({ status: { submitted: {} } })),
  )
  rpc.stageAccount(
    platformPda(),
    await encodePlatformState(platformStateFixture()),
    '996SiTqTBhydHAsTqt1vDn9sP5uW6Q9RUrc4ZdNcHyyv',
  )
  await expectAppError(
    makeAdapter(rpc).buildTx({
      action: 'approveCompletion',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
    500,
    'INTERNAL_ERROR',
  )
})

test('buildTx declineAssignedEscrow: decline instruction with mutation accounts', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, {
    status: { open: {} },
    counterparty: null,
    assignedCounterparty: COUNTERPARTY,
  })
  const a = makeAdapter(rpc)
  const d = decodeUnsigned(
    await a.buildTx({
      action: 'declineAssignedEscrow',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(d.discriminator, 'declineAssignedEscrow')
  assert.strictEqual(d.payer, COUNTERPARTY.toBase58())
})

test('buildTx approveCompletion (SOL escrow): settle accounts from on-chain state', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { submitted: {} } })
  const a = makeAdapter(rpc)
  const unsigned = await a.buildTx({
    action: 'approveCompletion',
    user_id: 'user-creator',
    payload: { escrow_id: ESCROW_UUID },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'approveCompletionSol')
  for (const expected of [CREATOR, COUNTERPARTY, TREASURY]) {
    assert.ok(d.keys.includes(expected.toBase58()), `missing ${expected.toBase58()}`)
  }
  // SOL settlement moves lamports directly — no ATA provisioning.
  assert.strictEqual(d.instructionCount, 1)
  assert.deepStrictEqual(d.ataOwners, [])
})

test('buildTx approveCompletion (SPL escrow): forks to _spl with party ATAs', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { submitted: {} }, asset: USDC_MINT })
  const a = makeAdapter(rpc)
  const unsigned = await a.buildTx({
    action: 'approveCompletion',
    user_id: 'user-creator',
    payload: { escrow_id: ESCROW_UUID },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'approveCompletionSpl')
  for (const owner of [CREATOR, COUNTERPARTY, TREASURY]) {
    assert.ok(
      d.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, owner).toBase58()),
      `missing ATA for ${owner.toBase58()}`,
    )
  }
  // Prepends idempotent ATA creation for all three settlement recipients so
  // the settlement instruction validates even against never-funded parties
  // (issue #88). Provisioning ix (3) + settlement ix (1).
  assert.strictEqual(d.instructionCount, 4)
  assert.deepStrictEqual(
    d.ataOwners.sort(),
    [CREATOR, COUNTERPARTY, TREASURY].map((k) => k.toBase58()).sort(),
  )
  // Fee-payer (creator, the approver) funds any first-time ATA rent.
  assert.strictEqual(d.payer, CREATOR.toBase58())
})

test('buildTx claimStalledPayment / reclaimAbandoned (SOL): right instruction, no ATA provisioning', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc)
  const a = makeAdapter(rpc)
  const claim = decodeUnsigned(
    await a.buildTx({
      action: 'claimStalledPayment',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(claim.discriminator, 'claimStalledPaymentSol')
  assert.strictEqual(claim.instructionCount, 1)
  const reclaim = decodeUnsigned(
    await a.buildTx({
      action: 'reclaimAbandoned',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(reclaim.discriminator, 'reclaimAbandonedSol')
  assert.strictEqual(reclaim.instructionCount, 1)
})

test('buildTx claimStalledPayment (SPL): provisions all three settlement ATAs, payer = claimant', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { submitted: {} }, asset: USDC_MINT })
  const a = makeAdapter(rpc)
  const d = decodeUnsigned(
    await a.buildTx({
      action: 'claimStalledPayment',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(d.discriminator, 'claimStalledPaymentSpl')
  assert.strictEqual(d.instructionCount, 4)
  assert.deepStrictEqual(
    d.ataOwners.sort(),
    [CREATOR, COUNTERPARTY, TREASURY].map((k) => k.toBase58()).sort(),
  )
  // The claimant (counterparty) is the fee-payer and funds first-time ATA rent.
  assert.strictEqual(d.payer, COUNTERPARTY.toBase58())
})

test('buildTx reclaimAbandoned (SPL): tight ReclaimSpl accounts, zero ATA provisioning (issue #88 redesign)', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { asset: USDC_MINT })
  const a = makeAdapter(rpc)
  const d = decodeUnsigned(
    await a.buildTx({
      action: 'reclaimAbandoned',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(d.discriminator, 'reclaimAbandonedSpl')
  // `ReclaimSpl` refunds only the creator — it never loads the counterparty or
  // treasury token accounts, so no ATA is provisioned (no phantom storage).
  assert.strictEqual(d.instructionCount, 1)
  assert.deepStrictEqual(d.ataOwners, [])
  // Only the creator's own ATA is referenced; counterparty/treasury ATAs absent.
  assert.ok(d.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, CREATOR).toBase58()))
  assert.ok(
    !d.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, COUNTERPARTY).toBase58()),
    'counterparty ATA must not appear',
  )
  assert.ok(
    !d.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, TREASURY).toBase58()),
    'treasury ATA must not appear',
  )
  assert.strictEqual(d.payer, CREATOR.toBase58())
})

test('buildTx settlement without counterparty on-chain → 409 ESCROW_WRONG_STATUS', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { counterparty: null, status: { open: {} } })
  const a = makeAdapter(rpc)
  await expectAppError(
    a.buildTx({
      action: 'approveCompletion',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
    409,
    'ESCROW_WRONG_STATUS',
  )
})

test('buildTx with no on-chain escrow account → 404 NOT_FOUND', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  await expectAppError(
    a.buildTx({
      action: 'cancelEscrow',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
    404,
    'NOT_FOUND',
  )
})

test('buildTx cancelEscrow / refundExpired: SOL and SPL variants', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { open: {} }, counterparty: null })
  const a = makeAdapter(rpc)
  const cancel = decodeUnsigned(
    await a.buildTx({
      action: 'cancelEscrow',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(cancel.discriminator, 'cancelEscrowSol')

  const rpcSpl = fakeSolanaRpc()
  rpcSpl.stageAccount(
    escrowPdaFromUuid(ESCROW_UUID),
    await encodeEscrowAccount(
      escrowAccountFixture({ status: { open: {} }, counterparty: null, asset: USDC_MINT }),
    ),
  )
  const aSpl = makeAdapter(rpcSpl)
  const refund = decodeUnsigned(
    await aSpl.buildTx({
      action: 'refundExpired',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  expectDiscriminator(refund.discriminator, 'refundExpiredSpl')
})

test('buildTx submitProof: base58 32-byte hash accepted; malformed rejected', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc)
  const a = makeAdapter(rpc)
  const hash32 = bs58.encode(Buffer.alloc(32, 7))
  const ok = decodeUnsigned(
    await a.buildTx({
      action: 'submitProof',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID, proof_hash: hash32 },
    }),
  )
  expectDiscriminator(ok.discriminator, 'submitProof')

  await expectAppError(
    a.buildTx({
      action: 'submitProof',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID, proof_hash: 'not-base58-0OIl' },
    }),
    422,
    'VALIDATION_ERROR',
  )
  await expectAppError(
    a.buildTx({
      action: 'submitProof',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID, proof_hash: bs58.encode(Buffer.alloc(16, 7)) },
    }),
    422,
    'VALIDATION_ERROR',
  )
})

test('buildTx disputeEscrow: bond arg validated; resolveDispute resolves raiser wallet', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc)
  const a = makeAdapter(rpc)

  const dispute = decodeUnsigned(
    await a.buildTx({
      action: 'disputeEscrow',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID, bond_raw: '100000000' },
    }),
  )
  expectDiscriminator(dispute.discriminator, 'disputeEscrowSol')

  await expectAppError(
    a.buildTx({
      action: 'disputeEscrow',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID, bond_raw: '-5' },
    }),
    422,
    'VALIDATION_ERROR',
  )

  const rpcDisputed = fakeSolanaRpc()
  await stageAcceptedEscrow(rpcDisputed)
  // The signing admin has NO linked Solana wallet (not in WALLETS): the resolve
  // tx must still build, fee-paid by the configured authority, never the admin.
  const resolved = decodeUnsigned(
    await makeAdapter(rpcDisputed).buildTx({
      action: 'resolveDispute',
      user_id: 'user-admin-no-wallet',
      signer_address: DISPUTE_AUTHORITY,
      payload: { escrow_id: ESCROW_UUID, winner: 'split', raiser_user_id: 'user-counterparty' },
    }),
  )
  expectDiscriminator(resolved.discriminator, 'resolveDisputeSol')
  assert.strictEqual(resolved.payer, DISPUTE_AUTHORITY)
  assert.strictEqual(resolved.instructionCount, 1)
})

test('buildTx disputeEscrow / resolveDispute on an SPL escrow: _spl variants with raiser + party ATAs', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { asset: USDC_MINT })
  const a = makeAdapter(rpc)

  const dispute = decodeUnsigned(
    await a.buildTx({
      action: 'disputeEscrow',
      user_id: 'user-counterparty',
      payload: { escrow_id: ESCROW_UUID, bond_raw: '100000000' },
    }),
  )
  expectDiscriminator(dispute.discriminator, 'disputeEscrowSpl')
  assert.ok(
    dispute.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, COUNTERPARTY).toBase58()),
    'missing raiser ATA',
  )
  // The raiser bonds from their own (already-funded) ATA — nothing to provision.
  assert.strictEqual(dispute.instructionCount, 1)
  assert.deepStrictEqual(dispute.ataOwners, [])

  const resolve = decodeUnsigned(
    await a.buildTx({
      action: 'resolveDispute',
      user_id: 'user-admin-no-wallet',
      signer_address: DISPUTE_AUTHORITY,
      payload: { escrow_id: ESCROW_UUID, winner: 'creator', raiser_user_id: 'user-creator' },
    }),
  )
  expectDiscriminator(resolve.discriminator, 'resolveDisputeSpl')
  for (const owner of [CREATOR, COUNTERPARTY, TREASURY]) {
    assert.ok(
      resolve.keys.includes(getAssociatedTokenAddressSync(USDC_MINT, owner).toBase58()),
      `missing ATA for ${owner.toBase58()}`,
    )
  }
  // `ResolveSpl` deserializes all three token accounts for every winner
  // outcome, so all three are provisioned regardless of who wins. Provisioning
  // ix (3) + resolve ix (1); dispute_admin funds first-time rent.
  assert.strictEqual(resolve.instructionCount, 4)
  assert.deepStrictEqual(
    resolve.ataOwners.sort(),
    [CREATOR, COUNTERPARTY, TREASURY].map((k) => k.toBase58()).sort(),
  )
  assert.strictEqual(resolve.payer, DISPUTE_AUTHORITY)
})

// ---------- ataProvisioningIx helper ---------------------------------------

test('ataProvisioningIx: one idempotent ATA-create per unique owner, correct account layout', async () => {
  const ixs = ataProvisioningIx(CREATOR, [CREATOR, COUNTERPARTY, TREASURY], USDC_MINT)
  assert.strictEqual(ixs.length, 3)
  ixs.forEach((ix, i) => {
    const owner = [CREATOR, COUNTERPARTY, TREASURY][i]
    assert.ok(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))
    // Idempotent create is ATA-program instruction index 1 (no-op if it exists).
    assert.deepStrictEqual(Array.from(ix.data), [1])
    // Account order: payer, ata, owner, mint, systemProgram, tokenProgram.
    assert.ok(ix.keys[0].pubkey.equals(CREATOR), 'payer')
    assert.ok(ix.keys[1].pubkey.equals(getAssociatedTokenAddressSync(USDC_MINT, owner)), 'ata')
    assert.ok(ix.keys[2].pubkey.equals(owner), 'owner')
    assert.ok(ix.keys[3].pubkey.equals(USDC_MINT), 'mint')
  })
})

test('ataProvisioningIx: de-duplicates repeated owners (e.g. treasury === creator)', async () => {
  const ixs = ataProvisioningIx(CREATOR, [CREATOR, COUNTERPARTY, CREATOR], USDC_MINT)
  assert.strictEqual(ixs.length, 2)
})

test('ataProvisioningIx: empty owners → no instructions', async () => {
  assert.deepStrictEqual(ataProvisioningIx(CREATOR, [], USDC_MINT), [])
})

// ---------- verifyTx -------------------------------------------------------

test('verifyTx: unknown signature → not confirmed (pending)', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  const r = await a.verifyTx('unknown-sig', { expected_event: 'EscrowCreated' })
  assert.deepStrictEqual(r.confirmed, false)
})

test('verifyTx: failed transaction → confirmed+failed with reason', async () => {
  const rpc = fakeSolanaRpc()
  rpc.stageTransaction('failed-sig', {
    failed: true,
    failure_reason: '{"InstructionError":[0,{"Custom":6014}]}',
    log_messages: [],
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('failed-sig', { expected_event: 'EscrowAccepted' })
  assert.ok(r.confirmed === true && r.failed === true)
  assert.match(r.reason, /6014/)
})

test('verifyTx: decodes EscrowCreated event with uuid, escrow_ref and actor', async () => {
  const rpc = fakeSolanaRpc()
  const logs = eventLogs('escrowCreated', {
    escrowId: Array.from(uuidToBytes(ESCROW_UUID)),
    kind: { gig: {} },
    asset: SystemProgram.programId,
    amount: new BN('1000000000'),
    creator: CREATOR,
    assignedCounterparty: null,
    acceptDeadline: new BN(1_900_000_000),
    completionDurationSeconds: new BN(7_200),
    disputeBond: new BN('100000000'),
    isSeeker: false,
    timestamp: new BN(1_899_000_000),
  })
  rpc.stageTransaction('ok-sig', { failed: false, failure_reason: null, log_messages: logs })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('ok-sig', {
    expected_event: 'EscrowCreated',
    escrow_id: ESCROW_UUID,
  })
  assert.ok(r.confirmed === true && r.failed === false)
  assert.strictEqual(r.event.name, 'EscrowCreated')
  assert.strictEqual(r.event.escrow_ref, escrowPdaFromUuid(ESCROW_UUID).toBase58())
  assert.strictEqual(r.event.fields.escrow_id, ESCROW_UUID)
  assert.strictEqual(r.event.fields.amount, '1000000000')
  assert.strictEqual(r.event.fields.kind, 'gig')
  assert.strictEqual(r.event.actor, `${CHAIN_ID}:${CREATOR.toBase58()}`)
})

test('verifyTx: expected event absent from logs → failed', async () => {
  const rpc = fakeSolanaRpc()
  const otherEvent = eventLogs('escrowCancelled', {
    escrowId: Array.from(uuidToBytes(ESCROW_UUID)),
    creator: CREATOR,
    refundAmount: new BN('1000000000'),
    timestamp: new BN(1_899_000_000),
  })
  rpc.stageTransaction('no-event-sig', {
    failed: false,
    failure_reason: null,
    log_messages: otherEvent,
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('no-event-sig', { expected_event: 'EscrowApproved' })
  assert.ok(r.confirmed === true && r.failed === true)
  assert.match(r.reason, /EscrowApproved/)
})

test('verifyTx: unframeable logs (unrelated tx) → failed, never throws', async () => {
  const rpc = fakeSolanaRpc()
  rpc.stageTransaction('weird-sig', {
    failed: false,
    failure_reason: null,
    log_messages: ['Program log: hello'],
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('weird-sig', { expected_event: 'EscrowApproved' })
  assert.ok(r.confirmed === true && r.failed === true)
})

// ---- wide-net path (polling / webhook: no expected_event) -----------------
// A program upgrade / IDL write / unrelated tx that the polling feed picks up
// must be classified `irrelevant` — NOT a failed attempt (issue #88 hardening).

test('verifyTx (wide net): unframeable logs (program-upgrade tx) → irrelevant, not failed', async () => {
  const rpc = fakeSolanaRpc()
  rpc.stageTransaction('upgrade-sig', {
    failed: false,
    failure_reason: null,
    log_messages: ['Program BPFLoaderUpgradeab1e11111111111111111111111 success'],
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('upgrade-sig', {}) // no expected_event = wide net
  assert.ok(r.confirmed === true && 'irrelevant' in r && r.irrelevant === true)
  assert.ok(!('failed' in r), 'must not be marked failed')
})

test('verifyTx (wide net): confirmed tx that emits no escrow event → irrelevant', async () => {
  const rpc = fakeSolanaRpc()
  rpc.stageTransaction('idl-sig', {
    failed: false,
    failure_reason: null,
    // Frameable program logs, but no `emit!` escrow event (e.g. an IDL write).
    log_messages: ['Program log: Instruction: IdlWrite'],
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('idl-sig', {})
  assert.ok(r.confirmed === true && 'irrelevant' in r && r.irrelevant === true)
})

test('verifyTx (wide net): a real escrow event still decodes (no regression)', async () => {
  const rpc = fakeSolanaRpc()
  const logs = eventLogs('escrowCancelled', {
    escrowId: Array.from(uuidToBytes(ESCROW_UUID)),
    creator: CREATOR,
    refundAmount: new BN('1000000000'),
    timestamp: new BN(1_899_000_000),
  })
  rpc.stageTransaction('wide-ok-sig', { failed: false, failure_reason: null, log_messages: logs })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('wide-ok-sig', {}) // wide net matches any escrow event
  assert.ok(r.confirmed === true && r.failed === false)
  assert.strictEqual(r.event.name, 'EscrowCancelled')
})

test('verifyTx (wide net): a genuinely failed tx is still failed, never irrelevant', async () => {
  const rpc = fakeSolanaRpc()
  rpc.stageTransaction('wide-failed-sig', {
    failed: true,
    failure_reason: '{"InstructionError":[1,{"Custom":6014}]}',
    log_messages: [],
  })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('wide-failed-sig', {})
  assert.ok(r.confirmed === true && 'failed' in r && r.failed === true)
})

test('verifyTx: escrow_id hint mismatch → failed', async () => {
  const rpc = fakeSolanaRpc()
  const logs = eventLogs('escrowAccepted', {
    escrowId: Array.from(uuidToBytes(ESCROW_UUID)),
    counterparty: COUNTERPARTY,
    completionDeadline: new BN(1_900_007_200),
    timestamp: new BN(1_899_000_000),
  })
  rpc.stageTransaction('mismatch-sig', { failed: false, failure_reason: null, log_messages: logs })
  const a = makeAdapter(rpc)
  const r = await a.verifyTx('mismatch-sig', {
    expected_event: 'EscrowAccepted',
    escrow_id: '99999999-9999-4999-8999-999999999999',
  })
  assert.ok(r.confirmed === true && r.failed === true)
  assert.match(r.reason, /does not match/)
})

// ---------- fetchEscrowState -----------------------------------------------

test('fetchEscrowState: missing account → null', async () => {
  const a = makeAdapter(fakeSolanaRpc())
  assert.strictEqual(await a.fetchEscrowState(escrowPdaFromUuid(ESCROW_UUID).toBase58()), null)
})

test('fetchEscrowState: decodes a full snapshot', async () => {
  const rpc = fakeSolanaRpc()
  const addr = escrowPdaFromUuid(ESCROW_UUID)
  rpc.stageAccount(addr, await encodeEscrowAccount(escrowAccountFixture()))
  const a = makeAdapter(rpc)
  const s = await a.fetchEscrowState(addr.toBase58())
  assert.ok(s !== null)
  assert.strictEqual(s.escrow_ref, addr.toBase58())
  assert.strictEqual(s.escrow_id, ESCROW_UUID)
  assert.strictEqual(s.kind, 'gig')
  assert.strictEqual(s.asset_address, null) // SystemProgram = native SOL
  assert.strictEqual(s.amount_raw, '1000000000')
  assert.strictEqual(s.creator_address, CREATOR.toBase58())
  assert.strictEqual(s.counterparty_address, COUNTERPARTY.toBase58())
  assert.strictEqual(s.assigned_counterparty_address, null)
  assert.strictEqual(s.status, 'accepted')
  assert.strictEqual(s.accept_deadline_unix, 1_900_000_000)
  assert.strictEqual(s.completion_duration_seconds, 7_200)
  assert.strictEqual(s.dispute_bond_raw, '100000000')
  assert.strictEqual(s.is_seeker, false)
})

test('fetchEscrowState: an account owned by a SUPERSEDED program reads as absent', async () => {
  // The trap this closes: Anchor's discriminator is derived from the account
  // NAME, so a superseded deployment's escrow decodes into a perfectly
  // well-formed snapshot. Byte-identical data — only the owner differs. Left
  // unchecked, a stranded escrow (open_issues #89) would report as live state
  // for a program that cannot sign for it.
  const rpc = fakeSolanaRpc()
  const addr = escrowPdaFromUuid(ESCROW_UUID)
  const encoded = await encodeEscrowAccount(escrowAccountFixture())
  const SUPERSEDED = '996SiTqTBhydHAsTqt1vDn9sP5uW6Q9RUrc4ZdNcHyyv' // a real predecessor
  rpc.stageAccount(addr, encoded, SUPERSEDED)
  assert.strictEqual(await makeAdapter(rpc).fetchEscrowState(addr.toBase58()), null)

  // Same bytes under the right owner DO decode — proves the rejection is the
  // owner check and not a broken fixture.
  const ours = fakeSolanaRpc()
  ours.stageAccount(addr, encoded)
  assert.notStrictEqual(await makeAdapter(ours).fetchEscrowState(addr.toBase58()), null)
})

test('fetchEscrowState: SPL escrow exposes the mint address', async () => {
  const rpc = fakeSolanaRpc()
  const addr = escrowPdaFromUuid(ESCROW_UUID)
  rpc.stageAccount(addr, await encodeEscrowAccount(escrowAccountFixture({ asset: USDC_MINT })))
  const a = makeAdapter(rpc)
  const s = await a.fetchEscrowState(addr.toBase58())
  assert.ok(s !== null)
  assert.strictEqual(s.asset_address, USDC_MINT.toBase58())
})

// ---------- ids round-trip ---------------------------------------------------

test('uuidToBytes/bytesToUuid: round-trips and validates', () => {
  assert.strictEqual(bytesToUuid(uuidToBytes(ESCROW_UUID)), ESCROW_UUID)
  assert.throws(() => uuidToBytes('not-a-uuid'))
  assert.throws(() => bytesToUuid(Buffer.alloc(15)))
})

// ---------- verifyAuthSig (unchanged surface) -------------------------------

function makeKeypair(): { address: string; secret: Uint8Array } {
  const kp = nacl.sign.keyPair()
  return { address: bs58.encode(kp.publicKey), secret: kp.secretKey }
}

function sign(secret: Uint8Array, message: string): string {
  const msg = new TextEncoder().encode(message)
  return Buffer.from(nacl.sign.detached(msg, secret)).toString('base64')
}

test('verifyAuthSig: signed message round-trips → true', async () => {
  const { address, secret } = makeKeypair()
  const message = 'Tenda auth-message v1\nnonce=abc123\nchain=solana:devnet'
  const a = makeAdapter(fakeSolanaRpc())
  assert.strictEqual(
    await a.verifyAuthSig({ address, message, signature: sign(secret, message) }),
    true,
  )
})

test('verifyAuthSig: tampered message / wrong address / malformed input → false', async () => {
  const { address, secret } = makeKeypair()
  const other = makeKeypair()
  const a = makeAdapter(fakeSolanaRpc())
  assert.strictEqual(
    await a.verifyAuthSig({ address, message: 'tampered', signature: sign(secret, 'original') }),
    false,
  )
  assert.strictEqual(
    await a.verifyAuthSig({ address: other.address, message: 'm', signature: sign(secret, 'm') }),
    false,
  )
  assert.strictEqual(
    await a.verifyAuthSig({
      address: 'not-a-valid-pubkey!!!',
      message: 'm',
      signature: Buffer.alloc(64).toString('base64'),
    }),
    false,
  )
  assert.strictEqual(
    await a.verifyAuthSig({ address, message: 'm', signature: Buffer.alloc(32).toString('base64') }),
    false,
  )
})

test('verifyEd25519: helper export matches adapter behaviour', () => {
  const { address, secret } = makeKeypair()
  assert.strictEqual(
    verifyEd25519({ address, message: 'msg', signature: sign(secret, 'msg') }),
    true,
  )
})

// ---------- computeFee -------------------------------------------------------

test('computeFee: delegates to lib/escrow (standard + seeker)', () => {
  const a = makeAdapter(fakeSolanaRpc())
  assert.strictEqual(
    a.computeFee({ amount_raw: '1000000', is_seeker: false, fee_bps: 250, seeker_fee_bps: 100 }),
    '25000',
  )
  assert.strictEqual(
    a.computeFee({ amount_raw: '1000000', is_seeker: true, fee_bps: 250, seeker_fee_bps: 100 }),
    '10000',
  )
})

// ---------- approval mode (stage 10) ---------------------------------------
// The EVM builder has these; the Solana one shipped without, so the worker
// resolution and the shared mutation-account shape were untested on this chain.

test('buildTx assignAccept: creator signs, worker rides as an ARGUMENT not an account', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { open: {} }, counterparty: null })
  const resolved: string[] = []
  const a = makeAdapter(rpc, resolved)
  const unsigned = await a.buildTx({
    action: 'assignAccept',
    user_id: 'user-creator',
    payload: { escrow_id: ESCROW_UUID, worker_user_id: 'user-counterparty' },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'assignAccept')
  assert.deepStrictEqual(d.keys.slice(0, 2), [
    escrowPdaFromUuid(ESCROW_UUID).toBase58(),
    platformPda().toBase58(),
  ])
  // The CREATOR pays and signs — the whole point of approval mode is that the
  // worker signs nothing, so their key must NOT appear in the account list.
  assert.strictEqual(d.payer, CREATOR.toBase58())
  assert.ok(!d.keys.includes(COUNTERPARTY.toBase58()), 'worker must not be an account')
  // …but their wallet must still have been resolved, to ride as an argument.
  assert.ok(resolved.includes('user-counterparty'))
})

test('buildTx assignAccept: a worker with no wallet on this chain fails cleanly', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { open: {} }, counterparty: null })
  const a = makeAdapter(rpc)
  await expectAppError(
    a.buildTx({
      action: 'assignAccept',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID, worker_user_id: 'user-with-no-wallet' },
    }),
    404,
    'USER_NOT_FOUND',
  )
})

test('buildTx unassign: creator-signed mutation instruction', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { accepted: {} } })
  const a = makeAdapter(rpc)
  const unsigned = await a.buildTx({
    action: 'unassign',
    user_id: 'user-creator',
    payload: { escrow_id: ESCROW_UUID },
  })
  const d = decodeUnsigned(unsigned)
  expectDiscriminator(d.discriminator, 'unassign')
  assert.deepStrictEqual(d.keys.slice(0, 2), [
    escrowPdaFromUuid(ESCROW_UUID).toBase58(),
    platformPda().toBase58(),
  ])
  assert.strictEqual(d.payer, CREATOR.toBase58())
})

// assignAccept and unassign are encoded in different branches of the action
// switch (one carries an argument, one shares the single-arg shape), so the
// discriminators are worth pinning against each other — a copy-paste between
// the two branches would otherwise encode the wrong instruction silently.
test('buildTx: assignAccept and unassign encode DISTINCT discriminators', async () => {
  const rpc = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc, { status: { open: {} }, counterparty: null })
  const a = makeAdapter(rpc)
  const assign = decodeUnsigned(
    await a.buildTx({
      action: 'assignAccept',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID, worker_user_id: 'user-counterparty' },
    }),
  )

  const rpc2 = fakeSolanaRpc()
  await stageAcceptedEscrow(rpc2, { status: { accepted: {} } })
  const unassign = decodeUnsigned(
    await makeAdapter(rpc2).buildTx({
      action: 'unassign',
      user_id: 'user-creator',
      payload: { escrow_id: ESCROW_UUID },
    }),
  )
  assert.notDeepStrictEqual(assign.discriminator, unassign.discriminator)
})
