/**
 * EVM lifecycle against a REAL node (anvil) — the test class whose absence
 * let the approval gap ship: every step drives the server's REAL builder
 * output (`adapter.buildTx`) through `eth_sendTransaction` exactly as the
 * mobile wallet would, so a missing on-chain precondition reverts HERE, not
 * on testnet.
 *
 * Covers: permit-payload → signTypedData → createEscrowWithPermit (single
 * tx, no approve); the approve fallback (hint consumed exactly as mobile
 * will); the negative that started it all (plain ERC-20 create with no
 * allowance reverts); accept → submit → approveCompletion with real fee
 * assertion; disputeEscrowWithPermit bond collection; verifyTx event decode.
 *
 * Gated: skips when the anvil binary or forge artifacts are absent (CI runs
 * it always — the foundry toolchain is installed there for the drift guard).
 * Anvil runs with the harness's second chain id (16602, 0G Galileo; it was Base Sepolia's until Base was PAUSED, 2026-10-02) so the manifest's permit
 * config (USDC version '2') applies verbatim; the mock token reproduces
 * Circle's v2 domain (test/mocks/MockUSDCPermitV2.sol).
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import type { Hex } from 'viem'
import { encodeApprove } from '@tenda/shared'
import { evmAdapter } from '@server/chains/evm'
import { computePlatformFee } from '@server/lib/escrow/fees'
import {
  ANVIL_CHAIN_ID,
  ANVIL_FEE_BPS,
  ERC20_ABI,
  anvilSkip,
  sendUnsigned as sendUnsignedOn,
  signPermit,
  startAnvilFixture,
  type AnvilFixture,
  type AnvilWallet,
} from '../helpers/anvil'
import type { UnsignedTx } from '@server/chains/types'

const skip = anvilSkip
const PORT = 8571
const AMOUNT = '25000000' // 25 USDC
const BOND = '1000000'

let fx: AnvilFixture
let adapter: ReturnType<typeof evmAdapter>

const sendUnsigned = (wallet: AnvilWallet, unsigned: UnsignedTx) => sendUnsignedOn(fx, wallet, unsigned)

before(async () => {
  if (skip) return
  fx = await startAnvilFixture(PORT)
  adapter = evmAdapter({
    chain_id: ANVIL_CHAIN_ID,
    rpc_url: fx.rpc_url, // REAL RPC layer against the real node
    escrow_contract: fx.escrowAddr,
    min_confirmations: 0, // anvil mines per-tx; no reorg margin needed
    deps: {
      resolveWalletAddress: async (user_id) => (user_id === 'worker' ? fx.worker.address : fx.creator.address),
      resolveAsset: async (asset) =>
        asset === 'ETH_BASE' ? { token_address: null } : { token_address: fx.tokenAddr },
      verifyWalletOwnership: async (_user, address) =>
        [fx.creator.address, fx.worker.address].map((a) => a.toLowerCase()).includes(address.toLowerCase()),
    },
  })
})

after(() => {
  fx?.kill()
})

function createPayload(escrow_id: string, bond = '0') {
  return {
    escrow_id,
    kind: 'gig' as const,
    asset: 'USDC_0G',
    amount_raw: AMOUNT,
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: bond,
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  }
}

test('the gap that started this: plain ERC-20 create with no allowance REVERTS on-chain', { skip }, async () => {
  const unsigned = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(randomUUID()),
  })
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') return
  // The hint tells the wallet what it must do first — this test ignores it,
  // exactly like the pre-fix mobile flow did, and must fail.
  assert.deepStrictEqual(unsigned.approval, {
    token: fx.tokenAddr,
    spender: fx.escrowAddr,
    amount_raw: AMOUNT,
    // #103: the server builds the approve so it can be tagged. Anvil is not a
    // Celo chain, so the calldata here is the untagged encoding — identical to
    // what the client used to build for itself.
    data: encodeApprove(fx.escrowAddr, AMOUNT),
  })
  await assert.rejects(
    fx.creatorWallet.sendTransaction({
      to: unsigned.to as `0x${string}`,
      data: unsigned.data as Hex,
      value: 0n,
    }),
  )
})

test('approve fallback: consuming the hint exactly as mobile will makes the same call land', { skip }, async () => {
  const escrow_id = randomUUID()
  const unsigned = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(escrow_id),
  })
  if (unsigned.kind !== 'evm-tx' || unsigned.approval === undefined) {
    assert.fail('expected a plain evm-tx with an approval hint')
  }
  // Broadcast the SERVER'S calldata, which is what the clients do since #103 —
  // `ensureAllowance` sends `approval.data` rather than re-encoding from the
  // terms. This test used to call writeContract('approve', [spender, amount]),
  // which is the pre-#103 client and no longer "exactly as mobile will": it
  // left the one path that carries the attribution suffix unexercised against a
  // real node.
  const approveHash = await fx.creatorWallet.sendTransaction({
    to: unsigned.approval.token as `0x${string}`,
    data: unsigned.approval.data as Hex,
    value: 0n,
  })
  await fx.pub.waitForTransactionReceipt({ hash: approveHash })
  const txHash = await sendUnsigned(fx.creatorWallet, unsigned)

  const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
})

/**
 * The property the whole of #103 rests on, against a REAL node and a REAL
 * ERC-20 rather than by appeal to the ABI spec: trailing bytes past a static
 * two-argument call are ignored, so a tagged `approve` still grants the
 * allowance.
 *
 * It was checked by hand once — `eth_call` of tagged calldata against live cNGN
 * and USDC_CELO on Celo mainnet, both returning true — and a hand check does not
 * run again. Anvil is not a Celo chain, so `approval.data` arrives untagged
 * here; the suffix is appended in the test to exercise the shape the Celo
 * builder produces. If a token ever rejects trailing calldata, the escrow
 * create that follows reverts and this fails.
 */
test('a TAGGED approve still grants the allowance on a real node', { skip }, async () => {
  const escrow_id = randomUUID()
  const unsigned = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(escrow_id),
  })
  if (unsigned.kind !== 'evm-tx' || unsigned.approval === undefined) {
    assert.fail('expected a plain evm-tx with an approval hint')
  }
  // The ERC-8021 shape: an 0x00-led envelope after the ABI arguments. The exact
  // bytes do not matter to the token — that trailing bytes exist does.
  const suffixed = `${unsigned.approval.data}00deadbeef` as Hex
  const approveHash = await fx.creatorWallet.sendTransaction({
    to: unsigned.approval.token as `0x${string}`,
    data: suffixed,
    value: 0n,
  })
  const approveReceipt = await fx.pub.waitForTransactionReceipt({ hash: approveHash })
  assert.strictEqual(approveReceipt.status, 'success', 'the tagged approve itself must not revert')

  // The allowance the token actually recorded — the approve did its job, the
  // trailing bytes changed neither the spender nor the amount.
  const allowance = await fx.pub.readContract({
    address: unsigned.approval.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [fx.creator.address as `0x${string}`, unsigned.approval.spender as `0x${string}`],
  })
  assert.strictEqual(allowance, BigInt(AMOUNT))

  // ...and the create it exists to enable lands.
  const txHash = await sendUnsigned(fx.creatorWallet, unsigned)
  const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
})

test('permit path: payload → signTypedData → createEscrowWithPermit lands with NO approve tx', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.buildPermitPayload)
  // 1. Server builds the typed data (live nonce + domain check inside).
  const payload = await adapter.buildPermitPayload({
    user_id: 'creator',
    owner: fx.creator.address,
    asset: 'USDC_0G',
    value_raw: AMOUNT,
  })
  // 2. Wallet signs it.
  const signature = await signPermit(fx.creator, payload.typed_data)
  // 3. Server encodes createEscrowWithPermit with the signature riding along.
  const unsigned = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: {
      ...createPayload(escrow_id),
      permit: { value_raw: payload.value_raw, deadline_unix: payload.deadline_unix, signature },
    },
  })
  if (unsigned.kind !== 'evm-tx') assert.fail('expected evm-tx')
  assert.strictEqual('approval' in unsigned, false) // allowance rides the tx
  // 4. ONE transaction — no approve ever sent for this escrow.
  const txHash = await sendUnsigned(fx.creatorWallet, unsigned)
  const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)

  // 5. Full lifecycle on the permit-created escrow, with real fee math.
  const treasuryBefore = await fx.pub.readContract({
    address: fx.tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [fx.treasury.address],
  })
  const accept = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'worker', payload: { escrow_id } })
  await sendUnsigned(fx.workerWallet, accept)
  const submit = await adapter.buildTx({
    action: 'submitProof',
    user_id: 'worker',
    payload: { escrow_id, proof_hash: `0x${'ab'.repeat(32)}` },
  })
  await sendUnsigned(fx.workerWallet, submit)
  const approve = await adapter.buildTx({ action: 'approveCompletion', user_id: 'creator', payload: { escrow_id } })
  await sendUnsigned(fx.creatorWallet, approve)

  const treasuryAfter = await fx.pub.readContract({
    address: fx.tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [fx.treasury.address],
  })
  // The rate the fixture DEPLOYED, not a second copy of it: a literal here
  // asserts the platform's cut against a number this file made up.
  const expectedFee = BigInt(computePlatformFee({
    amount_raw: AMOUNT,
    is_seeker: false,
    fee_bps: ANVIL_FEE_BPS,
    seeker_fee_bps: 0,
  }))
  assert.strictEqual(treasuryAfter - treasuryBefore, expectedFee)
})

test('0G refund: server calldata rejects early, then refunds after accept expiry', { skip }, async () => {
  const snapshot = await fx.node.snapshot()
  try {
    const escrow_id = randomUUID()
    assert.ok(adapter.buildPermitPayload)
    const permit = await adapter.buildPermitPayload({
      user_id: 'creator', owner: fx.creator.address, asset: 'USDC_0G', value_raw: AMOUNT,
    })
    const signature = await signPermit(fx.creator, permit.typed_data)
    const create = await adapter.buildTx({
      action: 'createEscrow', user_id: 'creator',
      payload: {
        ...createPayload(escrow_id),
        permit: { value_raw: permit.value_raw, deadline_unix: permit.deadline_unix, signature },
      },
    })
    await sendUnsigned(fx.creatorWallet, create)

    const refund = await adapter.buildTx({
      action: 'refundExpired', user_id: 'creator', payload: { escrow_id },
    })
    assert.strictEqual(refund.kind, 'evm-tx')
    if (refund.kind !== 'evm-tx') return
    // Exercise the exact server-built call the wallet receives. Contract
    // bytecode, not only the UI/server clock, must reject an early refund.
    await assert.rejects(fx.creatorWallet.sendTransaction({
      to: refund.to as `0x${string}`, data: refund.data as Hex, value: BigInt(refund.value),
    }))

    const balanceBefore = await fx.pub.readContract({
      address: fx.tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [fx.creator.address],
    })
    await fx.node.increaseTime({ seconds: 3_601 })
    await fx.node.mine({ blocks: 1 })
    const txHash = await sendUnsigned(fx.creatorWallet, refund)
    const balanceAfter = await fx.pub.readContract({
      address: fx.tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [fx.creator.address],
    })
    assert.strictEqual(balanceAfter - balanceBefore, BigInt(AMOUNT))

    const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowExpired', escrow_id })
    assert.strictEqual(verified.confirmed, true)
    assert.strictEqual(verified.failed, false)
    const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
    assert.strictEqual(state?.status, 'refunded')
  } finally {
    // Do not let time travel expire EIP-2612 permits in neighboring tests.
    await fx.node.revert({ id: snapshot })
  }
})

test('dispute bond via permit: disputeEscrowWithPermit collects the ERC-20 bond in one tx', { skip }, async () => {
  const escrow_id = randomUUID()
  // Creator funds via permit; worker accepts, then disputes with a permit
  // covering the bond — no approve tx anywhere in this test.
  assert.ok(adapter.buildPermitPayload)
  const createPermit = await adapter.buildPermitPayload({
    user_id: 'creator',
    owner: fx.creator.address,
    asset: 'USDC_0G',
    value_raw: AMOUNT,
  })
  const createSig = await signPermit(fx.creator, createPermit.typed_data)
  const create = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: {
      ...createPayload(escrow_id, BOND),
      permit: {
        value_raw: createPermit.value_raw,
        deadline_unix: createPermit.deadline_unix,
        signature: createSig,
      },
    },
  })
  await sendUnsigned(fx.creatorWallet, create)
  const accept = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'worker', payload: { escrow_id } })
  await sendUnsigned(fx.workerWallet, accept)

  const bondPermit = await adapter.buildPermitPayload({
    user_id: 'worker',
    owner: fx.worker.address,
    asset: 'USDC_0G',
    value_raw: BOND,
  })
  const bondSig = await signPermit(fx.worker, bondPermit.typed_data)
  const dispute = await adapter.buildTx({
    action: 'disputeEscrow',
    user_id: 'worker',
    payload: {
      escrow_id,
      bond_raw: BOND,
      permit: { value_raw: bondPermit.value_raw, deadline_unix: bondPermit.deadline_unix, signature: bondSig },
    },
  })
  if (dispute.kind !== 'evm-tx') assert.fail('expected evm-tx')
  assert.strictEqual('approval' in dispute, false)
  const txHash = await sendUnsigned(fx.workerWallet, dispute)
  const verified = await adapter.verifyTx(txHash, { expected_event: 'DisputeRaised', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)

  const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
  assert.strictEqual(state?.status, 'disputed')
  assert.strictEqual(state?.dispute_bond_raw, BOND)
})
