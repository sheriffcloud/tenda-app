/**
 * The chain half of the #20 hire loop: the two things a party does that the
 * relayer cannot do for them — sign and broadcast an unsigned transaction the
 * server built — plus the read helpers the settlement assertions need.
 *
 * Deliberately thin. Everything about WHAT to send comes from the server's own
 * `UnsignedTx`; this module only signs it, pays the gas and waits.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { UnsignedTx } from '@tenda/shared'

export const ERC20_ABI = parseAbi([
  'function mint(address,uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

/**
 * Galileo surfaces receipts slowly — viem's defaults gave up on a transaction
 * that had in fact landed (measured: accept mined in block 52006941 while
 * `waitForTransactionReceipt` had already thrown). Wait generously and poll
 * gently; a receipt that never comes is a real failure, an impatient client is
 * not.
 */
const RECEIPT_TIMEOUT_MS = 180_000
const RECEIPT_POLL_MS = 3_000

/**
 * Poll for a receipt ourselves. viem's `waitForTransactionReceipt` THROWS on
 * this node rather than waiting out its own timeout — measured twice on
 * transactions that had in fact succeeded (accept in block 52006941, a mint in
 * 52007059). A missing receipt here means "not indexed yet", so it is a reason
 * to keep asking, not to fail.
 */
async function waitForReceipt(
  ctx: ChainCtx,
  hash: Hex,
): Promise<{ status: 'success' | 'reverted'; gasUsed: bigint }> {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const r = await ctx.publicClient.getTransactionReceipt({ hash })
      return { status: r.status, gasUsed: r.gasUsed }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_MS))
    }
  }
  throw new Error(`no receipt for ${hash} after ${RECEIPT_TIMEOUT_MS}ms`)
}

export interface ChainCtx {
  rpcUrl: string
  token: Hex
  publicClient: PublicClient
}

export function chainCtx(rpcUrl: string, token: string): ChainCtx {
  return {
    rpcUrl,
    token: token as Hex,
    publicClient: createPublicClient({ transport: http(rpcUrl) }),
  }
}

export function actorAccount(key: string): PrivateKeyAccount {
  return privateKeyToAccount(key as Hex)
}

/** ERC-20 balance in base units. */
export async function usdc(ctx: ChainCtx, who: string): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: ctx.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [who as Hex],
  })
}

export async function native(ctx: ChainCtx, who: string): Promise<bigint> {
  return ctx.publicClient.getBalance({ address: who as Hex })
}

/** Fund an address with the mock token (its `mint` is unpermissioned by design). */
export async function mint(
  ctx: ChainCtx,
  funder: PrivateKeyAccount,
  to: string,
  amountRaw: bigint,
): Promise<Hex> {
  const wallet = createWalletClient({ account: funder, transport: http(ctx.rpcUrl) })
  const hash = await wallet.writeContract({
    address: ctx.token,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [to as Hex, amountRaw],
    chain: null,
  })
  const minted = await waitForReceipt(ctx, hash)
  if (minted.status !== 'success') throw new Error(`mint ${hash} REVERTED`)
  return hash
}

/**
 * Sign and broadcast an `UnsignedTx` the server built, and wait for it to be
 * mined. Throws on a reverted receipt — a transaction that lands with
 * `status: 'reverted'` is a FAILED step, not a completed one, and the loop must
 * stop there rather than poll for a state the chain never reached.
 */
export async function sendUnsigned(
  ctx: ChainCtx,
  actor: PrivateKeyAccount,
  unsigned: UnsignedTx,
): Promise<Hex> {
  if (unsigned.kind !== 'evm-tx') {
    throw new Error(`expected an evm-tx, got ${unsigned.kind}`)
  }
  const wallet = createWalletClient({ account: actor, transport: http(ctx.rpcUrl) })
  const hash = await wallet.sendTransaction({
    to: unsigned.to as Hex,
    data: unsigned.data as Hex,
    value: BigInt(unsigned.value),
    ...(unsigned.gas_limit !== undefined ? { gas: BigInt(unsigned.gas_limit) } : {}),
    chain: null,
  })
  const receipt = await waitForReceipt(ctx, hash)
  if (receipt.status !== 'success') {
    throw new Error(`transaction ${hash} REVERTED on chain`)
  }
  return hash
}
