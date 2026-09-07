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
 * Anvil runs with --chain-id 84532 so the manifest's Base Sepolia permit
 * config (USDC version '2') applies verbatim; the mock token reproduces
 * Circle's v2 domain (test/mocks/MockUSDCPermitV2.sol).
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseAbi,
  type Abi,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { evmAdapter } from '@server/chains/evm'
import type { UnsignedTx } from '@server/chains/types'
import type { PermitTypedData } from '@tenda/shared'

const CONTRACTS_OUT = join(__dirname, '../../../../contracts/evm/out')
const ESCROW_ARTIFACT = join(CONTRACTS_OUT, 'TendaEscrow.sol/TendaEscrow.json')
const MOCK_ARTIFACT = join(CONTRACTS_OUT, 'MockUSDCPermitV2.sol/MockUSDCPermitV2.json')

const anvilAvailable = spawnSync('anvil', ['--version'], { stdio: 'ignore' }).status === 0
const artifactsAvailable = existsSync(ESCROW_ARTIFACT) && existsSync(MOCK_ARTIFACT)
const skip = !anvilAvailable || !artifactsAvailable

// Anvil's well-known dev accounts (public test keys, default mnemonic).
const CREATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const WORKER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const TREASURY_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'

const CHAIN_ID = 'eip155:84532' // matches the manifest's permit config
const PORT = 8571
const RPC_URL = `http://127.0.0.1:${PORT}`
const AMOUNT = '25000000' // 25 USDC
const BOND = '1000000'

interface Artifact {
  abi: Abi
  bytecode: { object: Hex }
}

function loadArtifact(path: string): Artifact {
  return JSON.parse(readFileSync(path, 'utf8')) as Artifact
}

const creator = privateKeyToAccount(CREATOR_KEY)
const worker = privateKeyToAccount(WORKER_KEY)
const treasury = privateKeyToAccount(TREASURY_KEY)

const anvilChain = {
  id: 84532,
  name: 'anvil-84532',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const

const pub = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) })
const node = createTestClient({ chain: anvilChain, mode: 'anvil', transport: http(RPC_URL) })
const creatorWallet = createWalletClient({ account: creator, chain: anvilChain, transport: http(RPC_URL) })
const workerWallet = createWalletClient({ account: worker, chain: anvilChain, transport: http(RPC_URL) })

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

let anvil: ChildProcess | undefined
let escrowAddr: `0x${string}`
let tokenAddr: `0x${string}`
let adapter: ReturnType<typeof evmAdapter>

async function deploy(artifact: Artifact, args: readonly unknown[] = []): Promise<`0x${string}`> {
  const hash = await creatorWallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  assert.ok(receipt.contractAddress, 'deployment must yield an address')
  return receipt.contractAddress
}

/** Broadcast a server-built unsigned tx exactly as the mobile wallet does. */
async function sendUnsigned(
  wallet: typeof creatorWallet,
  unsigned: UnsignedTx,
): Promise<`0x${string}`> {
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') throw new Error('unreachable')
  const hash = await wallet.sendTransaction({
    to: unsigned.to as `0x${string}`,
    data: unsigned.data as Hex,
    value: BigInt(unsigned.value),
  })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  assert.strictEqual(receipt.status, 'success')
  return hash
}

/** Sign the server-built typed data — what eth_signTypedData_v4 does on device. */
async function signPermit(account: typeof creator, typed: PermitTypedData): Promise<string> {
  return account.signTypedData({
    domain: {
      name: typed.domain.name,
      version: typed.domain.version,
      chainId: typed.domain.chainId,
      verifyingContract: typed.domain.verifyingContract as `0x${string}`,
    },
    types: { Permit: typed.types.Permit },
    primaryType: 'Permit',
    message: {
      owner: typed.message.owner as `0x${string}`,
      spender: typed.message.spender as `0x${string}`,
      value: BigInt(typed.message.value),
      nonce: BigInt(typed.message.nonce),
      deadline: BigInt(typed.message.deadline),
    },
  })
}

before(async () => {
  if (skip) return
  anvil = spawn('anvil', ['--port', String(PORT), '--chain-id', '84532'], { stdio: 'ignore' })
  // Poll until the node answers instead of trusting startup logs.
  for (let i = 0; i < 50; i += 1) {
    try {
      await pub.getBlockNumber()
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  tokenAddr = await deploy(loadArtifact(MOCK_ARTIFACT))
  escrowAddr = await deploy(loadArtifact(ESCROW_ARTIFACT), [
    creator.address, // admin (rehearsal roles; irrelevant to these paths)
    creator.address, // disputeAdmin
    treasury.address, // treasury
    250,
    100,
    172_800,
    3_600,
  ])
  for (const to of [creator.address, worker.address]) {
    const hash = await creatorWallet.writeContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [to, 1_000_000_000n],
    })
    await pub.waitForTransactionReceipt({ hash })
  }

  adapter = evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: RPC_URL, // REAL RPC layer against the real node
    escrow_contract: escrowAddr,
    min_confirmations: 0, // anvil mines per-tx; no reorg margin needed
    deps: {
      resolveWalletAddress: async (user_id) => (user_id === 'worker' ? worker.address : creator.address),
      resolveAsset: async (asset) =>
        asset === 'ETH_BASE' ? { token_address: null } : { token_address: tokenAddr },
      verifyWalletOwnership: async (_user, address) =>
        [creator.address, worker.address].map((a) => a.toLowerCase()).includes(address.toLowerCase()),
    },
  })
})

after(() => {
  anvil?.kill()
})

function createPayload(escrow_id: string, bond = '0') {
  return {
    escrow_id,
    kind: 'gig' as const,
    asset: 'USDC_BASE',
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
  assert.deepStrictEqual(unsigned.approval, { token: tokenAddr, spender: escrowAddr, amount_raw: AMOUNT })
  await assert.rejects(
    creatorWallet.sendTransaction({
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
  const approveHash = await creatorWallet.writeContract({
    address: unsigned.approval.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [unsigned.approval.spender as `0x${string}`, BigInt(unsigned.approval.amount_raw)],
  })
  await pub.waitForTransactionReceipt({ hash: approveHash })
  const txHash = await sendUnsigned(creatorWallet, unsigned)

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
    owner: creator.address,
    asset: 'USDC_BASE',
    value_raw: AMOUNT,
  })
  // 2. Wallet signs it.
  const signature = await signPermit(creator, payload.typed_data)
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
  const txHash = await sendUnsigned(creatorWallet, unsigned)
  const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)

  // 5. Full lifecycle on the permit-created escrow, with real fee math.
  const treasuryBefore = await pub.readContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [treasury.address],
  })
  const accept = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'worker', payload: { escrow_id } })
  await sendUnsigned(workerWallet, accept)
  const submit = await adapter.buildTx({
    action: 'submitProof',
    user_id: 'worker',
    payload: { escrow_id, proof_hash: `0x${'ab'.repeat(32)}` },
  })
  await sendUnsigned(workerWallet, submit)
  const approve = await adapter.buildTx({ action: 'approveCompletion', user_id: 'creator', payload: { escrow_id } })
  await sendUnsigned(creatorWallet, approve)

  const treasuryAfter = await pub.readContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [treasury.address],
  })
  const expectedFee = (BigInt(AMOUNT) * 250n) / 10_000n
  assert.strictEqual(treasuryAfter - treasuryBefore, expectedFee)
})

test('Base refund: server calldata rejects early, then refunds after accept expiry', { skip }, async () => {
  const snapshot = await node.snapshot()
  try {
    const escrow_id = randomUUID()
    assert.ok(adapter.buildPermitPayload)
    const permit = await adapter.buildPermitPayload({
      user_id: 'creator', owner: creator.address, asset: 'USDC_BASE', value_raw: AMOUNT,
    })
    const signature = await signPermit(creator, permit.typed_data)
    const create = await adapter.buildTx({
      action: 'createEscrow', user_id: 'creator',
      payload: {
        ...createPayload(escrow_id),
        permit: { value_raw: permit.value_raw, deadline_unix: permit.deadline_unix, signature },
      },
    })
    await sendUnsigned(creatorWallet, create)

    const refund = await adapter.buildTx({
      action: 'refundExpired', user_id: 'creator', payload: { escrow_id },
    })
    assert.strictEqual(refund.kind, 'evm-tx')
    if (refund.kind !== 'evm-tx') return
    // Exercise the exact server-built call the wallet receives. Contract
    // bytecode, not only the UI/server clock, must reject an early refund.
    await assert.rejects(creatorWallet.sendTransaction({
      to: refund.to as `0x${string}`, data: refund.data as Hex, value: BigInt(refund.value),
    }))

    const balanceBefore = await pub.readContract({
      address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [creator.address],
    })
    await node.increaseTime({ seconds: 3_601 })
    await node.mine({ blocks: 1 })
    const txHash = await sendUnsigned(creatorWallet, refund)
    const balanceAfter = await pub.readContract({
      address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [creator.address],
    })
    assert.strictEqual(balanceAfter - balanceBefore, BigInt(AMOUNT))

    const verified = await adapter.verifyTx(txHash, { expected_event: 'EscrowExpired', escrow_id })
    assert.strictEqual(verified.confirmed, true)
    assert.strictEqual(verified.failed, false)
    const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
    assert.strictEqual(state?.status, 'refunded')
  } finally {
    // Do not let time travel expire EIP-2612 permits in neighboring tests.
    await node.revert({ id: snapshot })
  }
})

test('dispute bond via permit: disputeEscrowWithPermit collects the ERC-20 bond in one tx', { skip }, async () => {
  const escrow_id = randomUUID()
  // Creator funds via permit; worker accepts, then disputes with a permit
  // covering the bond — no approve tx anywhere in this test.
  assert.ok(adapter.buildPermitPayload)
  const createPermit = await adapter.buildPermitPayload({
    user_id: 'creator',
    owner: creator.address,
    asset: 'USDC_BASE',
    value_raw: AMOUNT,
  })
  const createSig = await signPermit(creator, createPermit.typed_data)
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
  await sendUnsigned(creatorWallet, create)
  const accept = await adapter.buildTx({ action: 'acceptEscrow', user_id: 'worker', payload: { escrow_id } })
  await sendUnsigned(workerWallet, accept)

  const bondPermit = await adapter.buildPermitPayload({
    user_id: 'worker',
    owner: worker.address,
    asset: 'USDC_BASE',
    value_raw: BOND,
  })
  const bondSig = await signPermit(worker, bondPermit.typed_data)
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
  const txHash = await sendUnsigned(workerWallet, dispute)
  const verified = await adapter.verifyTx(txHash, { expected_event: 'DisputeRaised', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)

  const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
  assert.strictEqual(state?.status, 'disputed')
  assert.strictEqual(state?.dispute_bond_raw, BOND)
})
