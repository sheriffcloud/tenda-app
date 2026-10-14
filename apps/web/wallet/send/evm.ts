/**
 * EVM transaction transport over the AppKit modal (port of mobile's
 * wallet/adapters/walletconnect.ts send half, minus the RN deep-link
 * foregrounding — a browser wallet surfaces its own prompt).
 *
 * DIVERGENCE from mobile, deliberate: mobile rides WC scope routing, so a
 * wallet that cannot switch chains (4902) falls back to the scope alone. Web
 * providers execute on the wallet's ACTIVE chain with no scope to fall back
 * on — so a failed switch ABORTS with instructions instead of broadcasting a
 * transaction that is guaranteed to land on the wrong chain.
 */
import { WalletError, isUserRejection, chainLabel } from '@tenda/shared'
import { WALLET_CHAINS } from '../config'
import { requireTxModal, guardTxRequest, type EvmRequestProvider, type TxModal } from './session'

/** A CAIP-2 EVM scope ('eip155:8453'), defaulting to our configured primary chain. */
function asScope(chainId: string | undefined): string {
  return chainId !== undefined && chainId.startsWith('eip155:') ? chainId : WALLET_CHAINS.eip155
}

/**
 * Pin the wallet's ACTIVE chain to the request's scope (EIP-3326 via
 * AppKit's switchNetwork) before the request goes out — on the wrong chain
 * our contracts don't exist and every transaction "reverts" in the wallet's
 * simulation. Only a KNOWN mismatch triggers the switch. The networks module
 * is imported lazily so this file never pulls Reown chain data into the
 * light bundle (it resolves instantly from cache once the runtime booted).
 */
async function ensureEvmChain(modal: TxModal, scope: string): Promise<void> {
  const current = modal.getCaipNetwork('eip155')?.caipNetworkId
  if (current === scope) return
  const { appKitNetworkForChain } = await import('../reown/networks')
  try {
    await modal.switchNetwork(appKitNetworkForChain(scope), { throwOnFailure: true })
  } catch (err) {
    if (isUserRejection(err)) {
      throw new WalletError('declined', 'Network switch was declined in the wallet')
    }
    throw new WalletError(
      'network',
      `Your wallet could not switch networks — switch it to ${chainLabel(scope)} and try again`,
      err,
    )
  }
}

/** One guarded string-returning provider request (tx hash / signature). */
async function requestString(
  modal: TxModal,
  args: { method: string; params: unknown[] },
  what: string,
): Promise<string> {
  const provider = modal.getProvider<EvmRequestProvider>('eip155')
  if (provider === undefined) {
    throw new WalletError('network', 'No EVM wallet connected, connect one first')
  }
  const result = await guardTxRequest(provider.request<string>(args))
  if (typeof result !== 'string') throw new Error(`Wallet returned a non-string ${what}`)
  return result
}

/**
 * Send a prepared EVM transaction through the connected wallet. `feeCurrency`
 * rides along for CELO (wallets that support it show gas in cUSD; others
 * ignore it). Returns the tx hash. Signature-compatible with the shared
 * allowance module's `SendEvmTx` seam.
 */
export async function sendEvmTransaction(input: {
  from: string
  to: string
  data: string
  /** Decimal string (wei). */
  value: string
  /** CAIP-2 ('eip155:8453') the tx must execute on. */
  chainId?: string
  feeCurrency?: string
}): Promise<string> {
  const modal = await requireTxModal()
  // BEFORE the main request: a refused switch must abort with nothing queued
  // in the wallet, not leave a dangling wrong-chain tx prompt.
  await ensureEvmChain(modal, asScope(input.chainId))
  return requestString(
    modal,
    {
      method: 'eth_sendTransaction',
      params: [
        {
          from: input.from,
          to: input.to,
          data: input.data,
          value: `0x${BigInt(input.value).toString(16)}`,
          ...(input.feeCurrency !== undefined ? { feeCurrency: input.feeCurrency } : {}),
        },
      ],
    },
    'tx hash',
  )
}

/**
 * Sign EIP-712 typed data (eth_signTypedData_v4). The payload arrives fully
 * built from the server (permit flow); this layer stringifies and forwards
 * it verbatim, so the wallet hashes exactly what the server verified against
 * the token's on-chain domain.
 */
export async function signEvmTypedData(input: {
  from: string
  typedData: object
  /** CAIP-2 ('eip155:84532') the signature must be domain-bound to. */
  chainId?: string
}): Promise<string> {
  const modal = await requireTxModal()
  await ensureEvmChain(modal, asScope(input.chainId))
  return requestString(
    modal,
    {
      method: 'eth_signTypedData_v4',
      params: [input.from, JSON.stringify(input.typedData)],
    },
    'signature',
  )
}
