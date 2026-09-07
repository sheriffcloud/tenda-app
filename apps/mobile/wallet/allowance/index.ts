/**
 * Reusable ERC-20 allowance module, ONE implementation behind both the
 * escrow flow's approve fallback (dispatch consumes the server's `approval`
 * hint through ensureAllowance) and the standalone Token-approvals settings
 * screen (read / set / revoke, independent of any escrow).
 *
 * Reads go over the chain's PUBLIC RPC (shared manifest, same source as
 * the balance readers); the approve transaction itself rides the connected
 * wallet session (sendEvmTransaction), so keys never leave the wallet.
 */
import { evmPublicRpcUrl, parseUnits } from '@tenda/shared'
import { WalletError } from '@/wallet/errors'
import { sendEvmTransaction } from '@/wallet/adapters/walletconnect'
import { addressWord, amountWord, evmRpc, evmRpcString } from '../evm-rpc'

/** ERC-20 `allowance(address,address)` selector. */
const ALLOWANCE_SELECTOR = '0xdd62ed3e'
/** ERC-20 `approve(address,uint256)` selector. */
const APPROVE_SELECTOR = '0x095ea7b3'

/** Receipt poll bounds: WC wallets can sit backgrounded for a while. */
export const RECEIPT_POLL_INTERVAL_MS = 2_000
export const RECEIPT_POLL_TIMEOUT_MS = 120_000

/** Pure calldata encoder for `approve(spender, amountRaw)`. */
export function encodeApprove(spender: string, amountRaw: string): string {
  return `${APPROVE_SELECTOR}${addressWord(spender)}${amountWord(amountRaw)}`
}

/** ERC-20 `approve(uint256)` ceiling — the biggest amount an allowance can carry. */
const MAX_UINT256 = 2n ** 256n - 1n

/**
 * User-typed decimal amount → base units ('12.5', 6 → '12500000'). Delegates
 * the BigInt-exact parse to the shared util, adding the EVM-specific uint256
 * ceiling; null (invalid input) is surfaced by the approvals screen.
 */
export function displayToAmountRaw(display: string, decimals: number): string | null {
  const raw = parseUnits(display, decimals)
  if (raw === null || BigInt(raw) > MAX_UINT256) return null
  return raw
}

function requireRpcUrl(chainId: string): string {
  const url = evmPublicRpcUrl(chainId)
  if (url === null) {
    throw new WalletError('network', `No public RPC configured for ${chainId}`)
  }
  return url
}

/**
 * Live `allowance(owner → spender)` in base units. Throws WalletError when
 * the read fails (RPC error, empty eth_call return), an unreadable
 * allowance must never masquerade as zero, or ensureAllowance prompts a
 * spurious approve and the approvals screen shows "No standing approval"
 * for a value it never saw.
 */
export async function readAllowance(args: {
  chainId: string
  token: string
  owner: string
  spender: string
}): Promise<string> {
  const data = `${ALLOWANCE_SELECTOR}${addressWord(args.owner)}${addressWord(args.spender)}`
  const hex = await evmRpcString(requireRpcUrl(args.chainId), 'eth_call', [
    { to: args.token, data },
    'latest',
  ])
  if (hex !== null && hex !== '0x' && hex !== '') {
    try {
      return BigInt(hex).toString()
    } catch {
      // malformed quantity, fall through to the typed error
    }
  }
  throw new WalletError('network', `Could not read the current allowance on ${args.chainId}, please try again`)
}

/** Send `approve(spender, amountRaw)` through the connected wallet session. */
export async function sendApprove(args: {
  chainId: string
  token: string
  spender: string
  amountRaw: string
  from: string
}): Promise<string> {
  return sendEvmTransaction({
    from: args.from,
    to: args.token,
    data: encodeApprove(args.spender, args.amountRaw),
    value: '0',
    chainId: args.chainId,
  })
}

/**
 * Poll until the tx is mined. 'timeout' does NOT mean failure, the tx may
 * still land; callers decide whether to re-check or surface a retry.
 */
export async function waitForReceipt(args: {
  chainId: string
  txHash: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<'confirmed' | 'reverted' | 'timeout'> {
  const rpcUrl = requireRpcUrl(args.chainId)
  const deadline = Date.now() + (args.timeoutMs ?? RECEIPT_POLL_TIMEOUT_MS)
  const interval = args.intervalMs ?? RECEIPT_POLL_INTERVAL_MS
  for (;;) {
    const receipt = await evmRpc(rpcUrl, 'eth_getTransactionReceipt', [args.txHash])
    if (typeof receipt === 'object' && receipt !== null && 'status' in receipt) {
      const status = (receipt as { status: unknown }).status
      if (status === '0x1') return 'confirmed'
      if (status === '0x0') return 'reverted'
    }
    if (Date.now() >= deadline) return 'timeout'
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

/**
 * Make sure `allowance(owner → spender) ≥ amountRaw` before a transferFrom-
 * dependent call broadcasts, the client leg of the server's `approval`
 * hint. Skips the wallet round-trip entirely when the standing allowance
 * already covers the amount.
 */
export async function ensureAllowance(args: {
  chainId: string
  token: string
  spender: string
  amountRaw: string
  owner: string
  /** Receipt-poll overrides (tests / callers with tighter budgets). */
  timeoutMs?: number
  intervalMs?: number
}): Promise<'sufficient' | 'approved'> {
  const current = await readAllowance({
    chainId: args.chainId,
    token: args.token,
    owner: args.owner,
    spender: args.spender,
  })
  if (BigInt(current) >= BigInt(args.amountRaw)) return 'sufficient'

  const txHash = await sendApprove({
    chainId: args.chainId,
    token: args.token,
    spender: args.spender,
    amountRaw: args.amountRaw,
    from: args.owner,
  })
  const outcome = await waitForReceipt({
    chainId: args.chainId,
    txHash,
    ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
    ...(args.intervalMs !== undefined ? { intervalMs: args.intervalMs } : {}),
  })
  if (outcome === 'reverted') {
    throw new WalletError('network', 'The approval transaction reverted, please try again')
  }
  if (outcome === 'timeout') {
    // Belt-and-braces: the approve may have landed after the poll window.
    const after = await readAllowance({
      chainId: args.chainId,
      token: args.token,
      owner: args.owner,
      spender: args.spender,
    })
    if (BigInt(after) < BigInt(args.amountRaw)) {
      throw new WalletError('network', 'Approval is taking too long to confirm, please retry')
    }
  }
  return 'approved'
}
