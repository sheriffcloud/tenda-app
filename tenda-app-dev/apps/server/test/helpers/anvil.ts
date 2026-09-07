/**
 * A REAL EVM node for the server's chain layer: anvil on a private port,
 * the repo's TendaEscrow + MockUSDCPermitV2 deployed fresh, the dev accounts
 * funded with mock USDC. Every anvil suite drives the server's real builder /
 * relayer output through `eth_sendTransaction` exactly as a wallet would, so
 * a missing on-chain precondition reverts HERE, not on testnet.
 *
 * Extracted from evm-lifecycle.anvil.test.ts when the relay suite (#18)
 * needed the same node, contracts and wallets — two copies of a fixture that
 * deploys contracts is how one of them ends up on the wrong bytecode.
 *
 * Gated: `anvilSkip` is true when the anvil binary or the forge artifacts are
 * absent (CI installs the foundry toolchain for the ABI drift guard, so it
 * runs there always). Each suite picks its OWN port — the runner executes
 * files concurrently.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as assert from 'node:assert'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseAbi,
  type Abi,
  type Hex,
  type PrivateKeyAccount,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { UnsignedTx } from '@server/chains/types'
import type { PermitTypedData } from '@tenda/shared'

const CONTRACTS_OUT = join(__dirname, '../../../../contracts/evm/out')
const ESCROW_ARTIFACT = join(CONTRACTS_OUT, 'TendaEscrow.sol/TendaEscrow.json')
const MOCK_ARTIFACT = join(CONTRACTS_OUT, 'MockUSDCPermitV2.sol/MockUSDCPermitV2.json')

const anvilAvailable = spawnSync('anvil', ['--version'], { stdio: 'ignore' }).status === 0
const artifactsAvailable = existsSync(ESCROW_ARTIFACT) && existsSync(MOCK_ARTIFACT)
export const anvilSkip = !anvilAvailable || !artifactsAvailable

/** Anvil's well-known dev accounts (public test keys, default mnemonic). */
export const ANVIL_KEYS = {
  creator: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  worker: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  treasury: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  relayer: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
} as const

/**
 * The grace period the fixture deploys TendaEscrow with — the window after
 * completionDeadline in which the worker may still submit and nobody may
 * reclaim. Named because suites that warp past it must warp past THIS value:
 * a second copy in a test silently goes wrong the day this one changes.
 */
export const ANVIL_GRACE_SECONDS = 3_600

/** Matches the manifest's Base Sepolia entry, so its permit/eip3009 config applies verbatim. */
const ANVIL_CHAIN_NUMERIC_ID = 84532
export const ANVIL_CHAIN_ID = `eip155:${ANVIL_CHAIN_NUMERIC_ID}`

export interface Artifact {
  abi: Abi
  bytecode: { object: Hex }
}

function loadArtifact(path: string): Artifact {
  return JSON.parse(readFileSync(path, 'utf8')) as Artifact
}

export const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

function chainFor(rpc_url: string) {
  return {
    id: ANVIL_CHAIN_NUMERIC_ID,
    name: `anvil-${ANVIL_CHAIN_NUMERIC_ID}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpc_url] } },
  } as const
}

export type AnvilWallet = ReturnType<typeof walletFor>

function walletFor(rpc_url: string, account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: chainFor(rpc_url), transport: http(rpc_url) })
}

export interface AnvilFixture {
  rpc_url: string
  pub: ReturnType<typeof createPublicClient>
  node: ReturnType<typeof createTestClient>
  creator: PrivateKeyAccount
  worker: PrivateKeyAccount
  treasury: PrivateKeyAccount
  creatorWallet: AnvilWallet
  workerWallet: AnvilWallet
  escrowAddr: `0x${string}`
  tokenAddr: `0x${string}`
  escrowAbi: Abi
  kill(): void
}

/**
 * Boot anvil on `port`, deploy the mock token + TendaEscrow (admin and
 * disputeAdmin = creator: rehearsal roles, irrelevant to these paths), and
 * mint 1000 USDC to creator and worker.
 */
export async function startAnvilFixture(port: number): Promise<AnvilFixture> {
  const rpc_url = `http://127.0.0.1:${port}`
  const chain = chainFor(rpc_url)
  const pub = createPublicClient({ chain, transport: http(rpc_url) })
  const node = createTestClient({ chain, mode: 'anvil', transport: http(rpc_url) })
  const creator = privateKeyToAccount(ANVIL_KEYS.creator)
  const worker = privateKeyToAccount(ANVIL_KEYS.worker)
  const treasury = privateKeyToAccount(ANVIL_KEYS.treasury)
  const creatorWallet = walletFor(rpc_url, creator)
  const workerWallet = walletFor(rpc_url, worker)

  const anvil: ChildProcess = spawn('anvil', ['--port', String(port), '--chain-id', String(ANVIL_CHAIN_NUMERIC_ID)], {
    stdio: 'ignore',
  })
  // Poll until the node answers instead of trusting startup logs.
  for (let i = 0; i < 50; i += 1) {
    try {
      await pub.getBlockNumber()
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const deploy = async (artifact: Artifact, args: readonly (`0x${string}` | number)[] = []): Promise<`0x${string}`> => {
    const hash = await creatorWallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args })
    const receipt = await pub.waitForTransactionReceipt({ hash })
    assert.ok(receipt.contractAddress, 'deployment must yield an address')
    return receipt.contractAddress
  }
  const escrowArtifact = loadArtifact(ESCROW_ARTIFACT)
  const tokenAddr = await deploy(loadArtifact(MOCK_ARTIFACT))
  const escrowAddr = await deploy(escrowArtifact, [
    creator.address,
    creator.address,
    treasury.address,
    250,
    100,
    172_800,
    ANVIL_GRACE_SECONDS,
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

  return {
    rpc_url, pub, node, creator, worker, treasury, creatorWallet, workerWallet,
    escrowAddr, tokenAddr, escrowAbi: escrowArtifact.abi,
    kill: () => { anvil.kill() },
  }
}

/** Broadcast a server-built unsigned tx exactly as the mobile wallet does. */
export async function sendUnsigned(
  fx: Pick<AnvilFixture, 'pub'>,
  wallet: AnvilWallet,
  unsigned: UnsignedTx,
): Promise<`0x${string}`> {
  assert.strictEqual(unsigned.kind, 'evm-tx')
  if (unsigned.kind !== 'evm-tx') throw new Error('unreachable')
  const hash = await wallet.sendTransaction({
    to: unsigned.to as `0x${string}`,
    data: unsigned.data as Hex,
    value: BigInt(unsigned.value),
  })
  const receipt = await fx.pub.waitForTransactionReceipt({ hash })
  assert.strictEqual(receipt.status, 'success')
  return hash
}

/** Sign the server-built typed data — what eth_signTypedData_v4 does on device. */
export function signPermit(account: PrivateKeyAccount, typed: PermitTypedData): Promise<Hex> {
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
