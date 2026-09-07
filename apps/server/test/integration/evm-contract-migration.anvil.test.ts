/**
 * A contract REDEPLOY, played out against a real EVM node (open_issues #89).
 *
 * Two `TendaEscrow` deployments live side by side on one anvil chain. An escrow
 * is funded into contract A, then B becomes current with A kept in the known
 * set — exactly what happens the day a new contract ships. Everything after that
 * must still reach A, because that is where the money is.
 *
 * This is the test class the issue was missing. A unit test can assert that
 * `buildTx` puts address A in the `to` field; only a real node proves the
 * resulting transaction is ACCEPTED by A, that the funds actually move out of
 * A's balance, and that the same call against B reverts. Pre-fix, every
 * transition below targeted B and reverted, and `verifyTx` reported A's own
 * events as a failed transaction.
 *
 * Gated: skips when the anvil binary or forge artifacts are absent (CI installs
 * the foundry toolchain for the drift guard, so it runs there).
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPublicClient, createWalletClient, http, parseAbi, type Abi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { evmAdapter } from '@server/chains/evm'
import { evmPollTick } from '@server/chains/evm/listener-polling'
import { createEvmRpc } from '@server/chains/evm/rpc'
import { buildContractRegistry, resolveEscrowContract } from '@server/chains/contracts'
import type { UnsignedTx } from '@server/chains/types'

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

const CHAIN_ID = 'eip155:84532'
// A port of its own: the sibling anvil suite runs on 8571 and both may run
// concurrently under the default test concurrency.
const PORT = 8573
const RPC_URL = `http://127.0.0.1:${PORT}`
const AMOUNT = '25000000' // 25 USDC
const FEE_BPS = 250n

interface Artifact {
  abi: Abi
  bytecode: { object: Hex }
}

const loadArtifact = (path: string): Artifact => JSON.parse(readFileSync(path, 'utf8')) as Artifact

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
const creatorWallet = createWalletClient({ account: creator, chain: anvilChain, transport: http(RPC_URL) })
const workerWallet = createWalletClient({ account: worker, chain: anvilChain, transport: http(RPC_URL) })

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

let anvil: ChildProcess | undefined
/** Contract A — the "previous" generation, where the escrow's funds end up. */
let oldEscrow: `0x${string}`
/** Contract B — the "current" generation after the redeploy. */
let newEscrow: `0x${string}`
let tokenAddr: `0x${string}`

/** Adapter as configured BEFORE the redeploy: A is current, and the only one. */
let beforeRedeploy: ReturnType<typeof evmAdapter>
/** Adapter as configured AFTER: B is current, A still known. */
let afterRedeploy: ReturnType<typeof evmAdapter>

async function deploy(artifact: Artifact, args: readonly unknown[] = []): Promise<`0x${string}`> {
  const hash = await creatorWallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
  })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  assert.ok(receipt.contractAddress, 'deployment must yield an address')
  return receipt.contractAddress
}

function makeAdapter(current: `0x${string}`, known: readonly string[]): ReturnType<typeof evmAdapter> {
  return evmAdapter({
    chain_id: CHAIN_ID,
    rpc_url: RPC_URL, // REAL RPC layer against the real node
    escrow_contract: current,
    escrow_contracts: known,
    min_confirmations: 0, // anvil mines per-tx; no reorg margin needed
    deps: {
      resolveWalletAddress: async (user_id) =>
        user_id === 'worker' ? worker.address : creator.address,
      resolveAsset: async () => ({ token_address: tokenAddr }),
    },
  })
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

async function approve(spender: `0x${string}`, amount: bigint): Promise<void> {
  const hash = await creatorWallet.writeContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount],
  })
  await pub.waitForTransactionReceipt({ hash })
}

const balanceOf = (owner: `0x${string}`): Promise<bigint> =>
  pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })

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

/**
 * Fund a fresh escrow into contract A using the PRE-redeploy configuration, and
 * return the row a server would then hold: id plus the contract it was stamped
 * with.
 */
async function escrowFundedInOldContract(): Promise<{ id: string; escrow_contract: string }> {
  const id = randomUUID()
  await approve(oldEscrow, BigInt(AMOUNT))
  const unsigned = await beforeRedeploy.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(id),
  })
  assert.strictEqual(unsigned.kind === 'evm-tx' ? unsigned.to : '', oldEscrow)
  await sendUnsigned(creatorWallet, unsigned)
  return { id, escrow_contract: oldEscrow }
}

before(async () => {
  if (skip) return
  anvil = spawn('anvil', ['--port', String(PORT), '--chain-id', '84532'], { stdio: 'ignore' })
  for (let i = 0; i < 50; i += 1) {
    try {
      await pub.getBlockNumber()
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  tokenAddr = await deploy(loadArtifact(MOCK_ARTIFACT))
  const escrowArtifact = loadArtifact(ESCROW_ARTIFACT)
  const ctorArgs = [
    creator.address, // admin
    creator.address, // disputeAdmin
    treasury.address,
    Number(FEE_BPS),
    100,
    172_800,
    3_600,
  ] as const
  // The same contract deployed twice — two generations, identical code, which
  // is precisely why nothing but the address distinguishes them.
  oldEscrow = await deploy(escrowArtifact, ctorArgs)
  newEscrow = await deploy(escrowArtifact, ctorArgs)
  assert.notStrictEqual(oldEscrow, newEscrow)

  const hash = await creatorWallet.writeContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [creator.address, 10_000_000_000n],
  })
  await pub.waitForTransactionReceipt({ hash })

  beforeRedeploy = makeAdapter(oldEscrow, [oldEscrow])
  afterRedeploy = makeAdapter(newEscrow, [newEscrow, oldEscrow])
})

after(() => {
  anvil?.kill()
})

// ---------- the whole lifecycle, against the superseded contract ------------

test(
  'after a redeploy, an escrow funded by the OLD contract completes end-to-end against it',
  { skip },
  async () => {
    const escrow = await escrowFundedInOldContract()
    const registry = buildContractRegistry(
      [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: newEscrow }],
      [{ chain_id: CHAIN_ID, address: oldEscrow.toLowerCase() }],
    )
    // What every transition route now does before building.
    const contract = resolveEscrowContract({ ...escrow, chain_id: CHAIN_ID }, registry)
    assert.strictEqual(contract, oldEscrow.toLowerCase())

    const escrowBefore = await balanceOf(oldEscrow)
    const workerBefore = await balanceOf(worker.address)
    const treasuryBefore = await balanceOf(treasury.address)

    // accept → submit → approve, each built by the SERVER and broadcast as the
    // wallet would. Pre-fix every one of these carried `to: newEscrow` and
    // reverted, because B has never heard of this escrow.
    const send = async (
      wallet: typeof creatorWallet,
      label: string,
      unsigned: UnsignedTx,
    ): Promise<void> => {
      assert.strictEqual(
        unsigned.kind === 'evm-tx' ? unsigned.to : '',
        oldEscrow,
        `${label} must target the contract holding the funds`,
      )
      await sendUnsigned(wallet, unsigned)
    }

    await send(
      workerWallet,
      'acceptEscrow',
      await afterRedeploy.buildTx({
        action: 'acceptEscrow',
        user_id: 'worker',
        contract,
        payload: { escrow_id: escrow.id },
      }),
    )
    await send(
      workerWallet,
      'submitProof',
      await afterRedeploy.buildTx({
        action: 'submitProof',
        user_id: 'worker',
        contract,
        payload: { escrow_id: escrow.id, proof_hash: `0x${'11'.repeat(32)}` },
      }),
    )
    await send(
      creatorWallet,
      'approveCompletion',
      await afterRedeploy.buildTx({
        action: 'approveCompletion',
        user_id: 'creator',
        contract,
        payload: { escrow_id: escrow.id },
      }),
    )

    // Settlement came out of the OLD contract's balance, and the split is the
    // real one — proof the funds moved, not merely that a tx succeeded.
    const fee = (BigInt(AMOUNT) * FEE_BPS) / 10_000n
    assert.strictEqual(await balanceOf(oldEscrow), escrowBefore - BigInt(AMOUNT))
    assert.strictEqual(await balanceOf(worker.address), workerBefore + (BigInt(AMOUNT) - fee))
    assert.strictEqual(await balanceOf(treasury.address), treasuryBefore + fee)
    // And the new contract was never involved.
    assert.strictEqual(await balanceOf(newEscrow), 0n)
  },
)

test('the pre-fix behaviour is genuinely broken: the same call against the NEW contract reverts', { skip }, async () => {
  // Pins WHY this matters. Building against "whichever contract is current" —
  // exactly what the code did before — produces a well-formed transaction that
  // the chain rejects, so the escrow can never be moved again.
  const escrow = await escrowFundedInOldContract()
  const unsigned = await afterRedeploy.buildTx({
    action: 'acceptEscrow',
    user_id: 'worker',
    payload: { escrow_id: escrow.id }, // no `contract` → falls back to current (B)
  })
  assert.strictEqual(unsigned.kind === 'evm-tx' ? unsigned.to : '', newEscrow)
  await assert.rejects(
    workerWallet.sendTransaction({
      to: unsigned.kind === 'evm-tx' ? (unsigned.to as `0x${string}`) : '0x',
      data: unsigned.kind === 'evm-tx' ? (unsigned.data as Hex) : '0x',
      value: 0n,
    }),
  )
})

// ---------- verification across generations ---------------------------------

test('verifyTx decodes an event emitted by the OLD contract and names it', { skip }, async () => {
  const id = randomUUID()
  await approve(oldEscrow, BigInt(AMOUNT))
  const unsigned = await beforeRedeploy.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(id),
  })
  const hash = await sendUnsigned(creatorWallet, unsigned)

  // The post-redeploy adapter must still verify it. Pre-fix this returned
  // { failed: true } and verify-tx wrote TX_FAILED against a tx that succeeded.
  const verified = await afterRedeploy.verifyTx(hash, { expected_event: 'EscrowCreated' })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual('failed' in verified ? verified.failed : undefined, false)
  if ('event' in verified) {
    assert.strictEqual(verified.event.fields.escrow_id, id)
    // The attested stamp: what the applier writes to escrows.escrow_contract.
    assert.strictEqual(verified.event.contract, oldEscrow.toLowerCase())
  }
})

test('an adapter that has FORGOTTEN the old contract cannot verify its events', { skip }, async () => {
  // The negative that proves the set is load-bearing rather than decorative:
  // drop A from the known set and the same receipt stops verifying.
  const id = randomUUID()
  await approve(oldEscrow, BigInt(AMOUNT))
  const hash = await sendUnsigned(
    creatorWallet,
    await beforeRedeploy.buildTx({
      action: 'createEscrow',
      user_id: 'creator',
      payload: createPayload(id),
    }),
  )
  const forgetful = makeAdapter(newEscrow, [newEscrow])
  const verified = await forgetful.verifyTx(hash, { expected_event: 'EscrowCreated' })
  assert.strictEqual('failed' in verified ? verified.failed : undefined, true)
})

// ---------- the listener sees both generations ------------------------------

test('one polling tick picks up OLD-contract activity in a single getLogs call', { skip }, async () => {
  const from = await pub.getBlockNumber()
  const id = randomUUID()
  await approve(oldEscrow, BigInt(AMOUNT))
  const hash = await sendUnsigned(
    creatorWallet,
    await beforeRedeploy.buildTx({
      action: 'createEscrow',
      user_id: 'creator',
      payload: createPayload(id),
    }),
  )

  const enqueued: string[] = []
  const watched: Array<readonly string[]> = []
  const rpc = createEvmRpc({ rpc_url: RPC_URL })
  const result = await evmPollTick({
    rpc: {
      getBlockNumber: () => rpc.getBlockNumber(),
      getLogRefs: (contracts, f, t) => {
        watched.push([...contracts])
        return rpc.getLogRefs(contracts, f, t)
      },
    },
    chain_id: CHAIN_ID,
    escrow_contracts: [newEscrow, oldEscrow],
    min_confirmations: 0,
    cursors: {
      async getCursor() {
        return Number(from)
      },
      async setCursor() {},
    },
    queue: {
      async enqueue(_name, payload) {
        enqueued.push((payload as { tx_ref: string }).tx_ref)
        return { job_id: 'x' }
      },
    },
    log: { info() {}, warn() {} },
  })

  assert.ok(result.logs > 0, 'the old contract emitted logs the tick must see')
  assert.ok(enqueued.includes(hash), 'the old-contract tx must be enqueued for verification')
  // Both addresses rode ONE request per range — watching a second contract is
  // free, which is the reason to bias toward over-inclusion.
  for (const set of watched) assert.deepStrictEqual(set, [newEscrow, oldEscrow])
})

// ---------- refusals --------------------------------------------------------

test('an escrow stamped with an unknown contract is refused before any tx is built', { skip }, async () => {
  const registry = buildContractRegistry(
    [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: newEscrow }],
    [{ chain_id: CHAIN_ID, address: oldEscrow.toLowerCase() }],
  )
  assert.throws(
    () =>
      resolveEscrowContract(
        {
          id: randomUUID(),
          chain_id: CHAIN_ID,
          escrow_contract: '0x000000000000000000000000000000000000dead',
        },
        registry,
      ),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ESCROW_MISMATCH',
  )
})

test('bond denomination is read from the ESCROW’s contract, and names it when absent', { skip }, async () => {
  // G6: this read used to consult the chain's configured contract. For an escrow
  // held by a previous one it would answer "no such escrow" and fall through to
  // `asset_address: null` — NATIVE — quietly pricing the dispute bond in the gas
  // token instead of the escrow's ERC-20. Now it reads the escrow's own contract
  // and, on a genuine absence, refuses while naming the contract consulted.
  const err = await afterRedeploy
    .buildTx({
      action: 'disputeEscrow',
      user_id: 'creator',
      contract: oldEscrow,
      payload: { escrow_id: randomUUID(), bond_raw: '1000000' }, // never created anywhere
    })
    .catch((e: unknown) => e)

  assert.ok(err instanceof Error)
  assert.match(err.message, new RegExp(oldEscrow, 'i'))
})

test('a permit is NOT encoded against a superseded contract; the approval hint takes over', { skip }, async () => {
  // The permit's spender is minted for the CURRENT contract (the permit-payload
  // endpoint is chain-scoped and takes no escrow), so it cannot authorise a pull
  // by the old one. The build must degrade to the plain call plus an approval
  // naming the RIGHT spender — never encode a signature that would revert, and
  // never emit neither.
  //
  // Driven on a REAL escrow that exists in the old contract, so the
  // bond-denomination read succeeds and the permit branch is actually reached.
  const escrow = await escrowFundedInOldContract()
  await sendUnsigned(
    workerWallet,
    await afterRedeploy.buildTx({
      action: 'acceptEscrow',
      user_id: 'worker',
      contract: oldEscrow,
      payload: { escrow_id: escrow.id },
    }),
  )

  const unsigned = await afterRedeploy.buildTx({
    action: 'disputeEscrow',
    user_id: 'creator',
    contract: oldEscrow,
    payload: {
      escrow_id: escrow.id,
      bond_raw: '1000000',
      // A well-formed signature (v = 0x1b): it must be DECLINED for being
      // un-encodable here, not for failing to parse.
      permit: {
        value_raw: '1000000',
        deadline_unix: 9_999_999_999,
        signature: `0x${'ab'.repeat(32)}${'cd'.repeat(32)}1b`,
      },
    },
  })

  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') return
  assert.strictEqual(unsigned.to, oldEscrow)
  // The SPENDER is the claim: it must be the contract that will actually pull
  // the bond, not the chain's current one.
  assert.strictEqual(
    unsigned.approval?.spender,
    oldEscrow,
    'the wallet must be told to approve the OLD contract, since the permit cannot',
  )
  assert.strictEqual(unsigned.approval?.amount_raw, '1000000')
  // Case-insensitive on purpose: `asset_address` reaches the hint from the
  // asset registry on a create, but from an on-chain read on a dispute, and viem
  // returns checksummed addresses. Both name the same token, and address casing
  // is irrelevant to the `approve()` call the wallet makes.
  assert.strictEqual(unsigned.approval?.token.toLowerCase(), tokenAddr.toLowerCase())
})
