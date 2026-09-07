/**
 * WalletConnect (Reown AppKit v2), the live EVM `WalletAdapter`. One adapter
 * covers EVERY WC v2 wallet (MetaMask, Trust, Rainbow, SafePal, Coinbase…):
 * AppKit shows its own wallet list, the relay carries connect + sign, and the
 * user keeps their keys. This replaced `@metamask/connect-multichain`, whose RN
 * sign path hung on-device (device-verified 2026-06-23: Trust, Rainbow, SafePal
 * all connect + `personal_sign` cleanly over WC where MetaMask's own SDK did not).
 *
 * Hook→imperative seam: AppKit's API is hook-based, so the connection lives in
 * `<ReownProvider>` (mounted at the app root, in `reown/bridge`) and is mirrored
 * into the React-free `connectionSignal` singleton, which this adapter drives
 * imperatively. Connect/sign compose through the shared `connectThenSign` helper
 *, same path Phantom uses, so decline→`null` handling is centralised (DRY).
 *
 * EVM ONLY. Solana stays on MWA (Android) / Phantom (iOS).
 */
import { Buffer } from 'buffer'
import { Linking } from 'react-native'
import { requireEvmPublicRpcUrl } from '@tenda/shared'
import { WalletError } from '@/wallet/errors'
import { connectThenSign, isUserRejection } from './connect-then-sign'
import { connectionSignal, type EvmRequestProvider } from '../reown/connection-signal'
import { guardWcRequest } from '../reown/request-guard'
import { reownConfigured } from '../reown/config'
import { WALLET_CHAINS } from '../config'
import type { SignMessageResult, SpikeAccount } from '../types'
import type { AuthenticateResult, WalletAdapter } from './types'

/** A CAIP-2 EVM scope ('eip155:8453'), defaulting to our configured primary chain. */
function asScope(chainId: string | undefined): string {
  return chainId !== undefined && chainId.startsWith('eip155:') ? chainId : WALLET_CHAINS.eip155
}

/** The live EVM provider, or a typed error when no session is active. */
function requireProvider(): EvmRequestProvider {
  const provider = connectionSignal.getProvider()
  if (provider === undefined) {
    throw new WalletError('network', 'No EVM wallet connected, connect one first')
  }
  return provider
}

function hexMessage(message: string): string {
  return '0x' + Buffer.from(message, 'utf8').toString('hex')
}

/**
 * Bring the connected wallet to the foreground so the user actually SEES the
 * pending request.
 *
 * WalletConnect/AppKit-RN does NOT auto-reopen the wallet for a session request
 * here: `sign-client` only reopens via a `WALLETCONNECT_DEEPLINK_CHOICE` that
 * nothing in this stack ever writes. After a fresh connect the wallet has
 * auto-returned to Tenda (backgrounded), so a `personal_sign` /
 * `eth_sendTransaction` would sit unseen on the relay until it EXPIRES
 * ("Request expired"). Opening the wallet's own deep link (from AppKit
 * `useWalletInfo`) is exactly what WC's `handleDeeplinkRedirect` would do, the
 * wallet foregrounds and renders the pending request. Best-effort: a missing or
 * un-openable link just means the user reopens the wallet manually.
 */
async function foregroundConnectedWallet(): Promise<void> {
  const href = connectionSignal.getPeerRedirect()
  if (href === undefined || href === '') return
  try {
    await Linking.openURL(href)
  } catch {
    // Not installed / can't open, the request still stands; user opens it.
  }
}

/**
 * Pin the wallet's ACTIVE chain to a request's scope (EIP-3326
 * wallet_switchEthereumChain) before the request goes out. WC scope routing
 * SHOULD make the wallet act on the scope's chain, but some wallets execute
 * on whatever chain is active — and on the wrong chain our contracts don't
 * exist, so every transaction "reverts" in the wallet's simulation. Only a
 * KNOWN mismatch (session-reported chain ≠ scope) triggers the switch; a
 * wallet that can't switch (chain not added / method unsupported) falls back
 * to scope routing as before, while a user REJECTION aborts as a decline —
 * broadcasting after a refused switch would be the wrong-chain bug on purpose.
 */
async function ensureSessionChain(scope: string): Promise<void> {
  const current = connectionSignal.getAccount()?.chainId
  if (current === undefined || current === scope) return
  const provider = requireProvider()
  const chainId = `0x${Number(scope.split(':')[1]).toString(16)}`
  // The switch rides the CURRENT chain's scope — that's where the wallet is.
  const pending = provider.request<null>(
    { method: 'wallet_switchEthereumChain', params: [{ chainId }] },
    current,
  )
  await foregroundConnectedWallet()
  try {
    await guardWcRequest(pending)
  } catch (err) {
    if (err instanceof WalletError) throw err // guard timeout / Cancel abort
    if (isUserRejection(err)) {
      throw new WalletError('declined', 'Network switch was declined in the wallet')
    }
    // 4902 (chain not added) / 4200 (unsupported method) / wallet quirks:
    // keep the pre-pinning behaviour, the scope alone routes the request.
  }
}

/**
 * The one way a session request goes out: pin the chain when the request is
 * chain-scoped, dispatch (publishes the request to the relay), THEN foreground
 * the wallet so the prompt is waiting when it opens — don't await before
 * opening, it won't resolve until the user acts. The await rides
 * `guardWcRequest`, which turns a lost relay response into a typed timeout
 * (and clears the wedged session) instead of hanging the flow forever, and
 * gives the UI's Cancel button something to abort.
 */
async function requestStringOverSession(
  args: { method: string; params: unknown[] },
  scope: string | undefined,
  what: string,
): Promise<string> {
  // BEFORE publishing the main request: a rejected switch must abort with
  // nothing queued in the wallet, not leave a dangling wrong-chain tx prompt.
  if (scope !== undefined) await ensureSessionChain(scope)
  const provider = requireProvider()
  const pending = scope === undefined ? provider.request<string>(args) : provider.request<string>(args, scope)
  await foregroundConnectedWallet()
  const result = await guardWcRequest(pending)
  if (typeof result !== 'string') throw new Error(`Wallet returned a non-string ${what}`)
  return result
}

async function connect(opts?: { fresh?: boolean }): Promise<SpikeAccount> {
  return connectionSignal.connect(opts)
}

async function signMessage(account: SpikeAccount, message: string): Promise<SignMessageResult> {
  const signature = await requestStringOverSession(
    { method: 'personal_sign', params: [hexMessage(message), account.address] },
    undefined,
    'signature',
  )
  return { signature, message }
}

async function disconnect(): Promise<void> {
  await connectionSignal.disconnect()
}

function authenticate(
  buildMessage: (account: SpikeAccount) => string,
  opts?: { forceFresh?: boolean },
): Promise<AuthenticateResult | null> {
  // Login reuses a restored session if AppKit auto-reconnected one (fast path,
  // no extra round-trip); linking passes forceFresh to disconnect first so the
  // user can pick a DIFFERENT wallet. To keep login from silently reusing a
  // STALE session across accounts, logout clears the WC session (auth.store) so
  // the next login starts clean and shows the sheet.
  return connectThenSign({ connect, signMessage, disconnect }, buildMessage, opts)
}

async function getRestoredAccount(): Promise<SpikeAccount | null> {
  return connectionSignal.getAccount()
}

/**
 * Send a prepared EVM transaction over the connected WC session. Targets
 * `input.chainId`'s scope directly. `feeCurrency` rides along for CELO, wallets
 * that support it show gas in cUSD; others ignore it. Returns the tx hash.
 */
export async function sendEvmTransaction(input: {
  from: string
  to: string
  data: string
  /** Decimal string (wei). */
  value: string
  /** CAIP-2 ('eip155:8453'), the scope the tx is sent on. */
  chainId?: string
  feeCurrency?: string
}): Promise<string> {
  return requestStringOverSession(
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
    asScope(input.chainId),
    'tx hash',
  )
}

/**
 * Sign EIP-712 typed data over the connected WC session
 * (eth_signTypedData_v4). The payload arrives fully built from the server
 * (permit flow), this layer stringifies and forwards it verbatim, so the
 * wallet hashes exactly what the server verified against the token's
 * on-chain domain.
 */
export async function signEvmTypedData(input: {
  from: string
  typedData: object
  /** CAIP-2 ('eip155:84532'), the scope the request is sent on. */
  chainId?: string
}): Promise<string> {
  return requestStringOverSession(
    {
      method: 'eth_signTypedData_v4',
      params: [input.from, JSON.stringify(input.typedData)],
    },
    asScope(input.chainId),
    'signature',
  )
}

/**
 * EVM receipt poll for TransactionMonitor's RPC fallback (CO3). Queried over a
 * direct JSON-RPC `fetch` to the tx's OWN chain public RPC (resolved from the
 * manifest, single source), NOT the wallet session, so it never wakes the wallet
 * and works while it's backgrounded — and a receipt on any configured EVM chain
 * (Base, Celo, …) is polled correctly, not just a single "primary" chain.
 * `status` is '0x1' on success, '0x0' on revert; a missing receipt = pending.
 */
export async function getEvmTransactionStatus(
  tx_hash: string,
  chain_id: string,
): Promise<'confirmed' | 'failed' | 'not_found'> {
  const response = await fetch(requireEvmPublicRpcUrl(chain_id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx_hash] }),
  })
  const body: unknown = await response.json()
  const receipt =
    typeof body === 'object' && body !== null && 'result' in body
      ? (body as { result: { status?: string } | null }).result
      : null
  if (receipt === null) return 'not_found'
  if (receipt.status === '0x1') return 'confirmed'
  if (receipt.status === '0x0') return 'failed'
  return 'not_found'
}

export const walletConnectAdapter: WalletAdapter = {
  id: 'walletconnect',
  name: 'EVM Wallet',
  tagline: 'MetaMask, Trust, Rainbow & more',
  namespaces: ['eip155'],
  // No bundled icon, falls back to the generic wallet glyph (AppKit shows the
  // real per-wallet icons inside its own modal).
  isAvailable: async () => reownConfigured,
  isInstalled: async () => true,
  connect,
  signMessage,
  authenticate,
  disconnect,
  getRestoredAccount,
}
