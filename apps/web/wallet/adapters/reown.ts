/**
 * The live web `WalletAdapter`, backed by Reown AppKit's dual-chain modal.
 * ONE adapter covers every wallet AppKit lists — EVM (MetaMask, Trust,
 * Rainbow…) AND Solana (Phantom, Solflare…) — because on web both namespaces
 * ride the same modal; the RN transport split (WC / MWA / universal links)
 * does not exist here.
 *
 * Sign encodings match the server's per-chain expectation (shared
 * `AuthenticateResult` contract): `personal_sign` 0x-hex for EVM, base64 for
 * Solana.
 */
import { connectThenSign, WalletError } from '@tenda/shared'
import type { AuthenticateResult, ChainNamespace, SignMessageResult, WalletAccount } from '@tenda/shared'
import { loadWalletRuntime, peekWalletRuntime, walletConfigured } from '../runtime'
import {
  connectedAccount,
  settledConnectedAccount,
  waitForConnection,
  REOWN_WALLET_ID,
  type ConnectModal,
} from './reown-connect'
import type { WalletAdapter } from './types'

/** Minimal structural view of the AppKit EVM provider (mobile's twin). */
interface EvmRequestProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>
}

/** AppKit's Solana provider slice — just the message signer. */
interface SolanaSignProvider {
  signMessage(message: Uint8Array): Promise<Uint8Array>
}

/** The modal surface this adapter drives (the real AppKit satisfies it). */
interface AdapterModal extends ConnectModal {
  getProvider<T>(namespace: ChainNamespace): T | undefined
  disconnect(): Promise<void>
}

async function requireModal(): Promise<AdapterModal> {
  const state = await loadWalletRuntime()
  if (state.status === 'disabled') {
    throw new WalletError('no_wallet', 'Wallet connect is not configured for this build')
  }
  return state.runtime.modal
}

async function connect(opts?: { fresh?: boolean }): Promise<WalletAccount> {
  const modal = await requireModal()
  if (!opts?.fresh) {
    // Settled, not a bare peek: a lazily-booted runtime may still be
    // RESTORING a persisted session, and opening the modal over it races the
    // sign prompt against the wallet list.
    const existing = await settledConnectedAccount(modal)
    if (existing !== null) return existing
  }
  // fresh rides through: only an account the user picks AFTER the modal is
  // presented counts (a restored session racing the list into a sign prompt
  // was the linking bug). Namespace stays open — the user decides the wallet.
  return waitForConnection(modal, opts?.fresh ? { fresh: true } : undefined)
}

function hexMessage(message: string): string {
  const bytes = new TextEncoder().encode(message)
  let hex = '0x'
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** Auth messages are short — the byte-by-byte btoa path is fine here. */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function signMessage(account: WalletAccount, message: string): Promise<SignMessageResult> {
  const modal = await requireModal()
  if (account.namespace === 'eip155') {
    const provider = modal.getProvider<EvmRequestProvider>('eip155')
    if (provider === undefined) throw new WalletError('network', 'No EVM wallet connected, connect one first')
    const signature = await provider.request<string>({
      method: 'personal_sign',
      params: [hexMessage(message), account.address],
    })
    if (typeof signature !== 'string') throw new Error('Wallet returned a non-string signature')
    return { signature, message }
  }
  const provider = modal.getProvider<SolanaSignProvider>('solana')
  if (provider === undefined) throw new WalletError('network', 'No Solana wallet connected, connect one first')
  const signed = await provider.signMessage(new TextEncoder().encode(message))
  return { signature: base64FromBytes(signed), message }
}

async function disconnect(): Promise<void> {
  // peek, never load: an unbooted runtime cannot be holding a session.
  const runtime = peekWalletRuntime()
  if (runtime === null) return
  await runtime.modal.disconnect()
}

function authenticate(
  buildMessage: (account: WalletAccount) => string,
  opts?: { forceFresh?: boolean },
): Promise<AuthenticateResult | null> {
  return connectThenSign({ connect, signMessage, disconnect }, buildMessage, opts)
}

async function getRestoredAccount(): Promise<WalletAccount | null> {
  const runtime = peekWalletRuntime()
  return runtime === null ? null : connectedAccount(runtime.modal)
}

export const reownAdapter: WalletAdapter = {
  id: REOWN_WALLET_ID,
  name: 'Wallet',
  tagline: 'MetaMask, Phantom, Trust & more',
  namespaces: ['solana', 'eip155'],
  isAvailable: async () => walletConfigured(),
  connect,
  signMessage,
  authenticate,
  disconnect,
  getRestoredAccount,
}
