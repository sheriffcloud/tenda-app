import { Platform } from 'react-native'
import { Buffer } from 'buffer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  PublicKey,
  VersionedTransaction,
  type Transaction,
} from '@solana/web3.js'
import { TRANSACTION_COPY } from '@tenda/shared'
import bs58 from 'bs58'
import { authorizeSession, withMwaRetry } from './mwa-shared'
import { WalletError } from '@tenda/shared'
import { WALLET_CHAINS } from '../config'
import type { SignMessageResult, WalletAccount } from '@tenda/shared'
import type { AuthenticateResult } from '@tenda/shared'
import type { WalletAdapter } from './types'
import { isRetryableSolanaRpcError } from '@tenda/shared'
import { solanaRpcTransport } from '@/wallet/solana-rpc'

/**
 * Generic Android-Solana adapter via Solana Mobile Wallet Adapter (MWA).
 * The MWA spec doesn't expose a wallet-targeting API for local Android, the
 * OS routes the association intent to its default Solana wallet, or shows a
 * disambiguation chooser if none is set as default. Our picker therefore
 * presents a single "Solana Wallet" entry on Android; per-wallet branding
 * only makes sense where we have real per-wallet transports (i.e. iOS).
 *
 * On iOS this adapter reports `isAvailable: false` so the picker hides it.
 */

const STORAGE_KEY_AUTH_TOKEN = 'wallet.solana-mwa.authToken'
const STORAGE_KEY_ADDRESS = 'wallet.solana-mwa.address'

const ADAPTER_ID = 'solana-mwa'

function base64ToAddress(b64: string): string {
  return new PublicKey(Buffer.from(b64, 'base64')).toBase58()
}

function addressToBase64(address: string): string {
  return Buffer.from(new PublicKey(address).toBytes()).toString('base64')
}

function accountFor(address: string): WalletAccount {
  return { namespace: 'solana', chainId: WALLET_CHAINS.solana, address, walletId: ADAPTER_ID }
}

async function connect(): Promise<WalletAccount> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
  const result = await withMwaRetry((wallet) => authorizeSession(wallet, stored))
  const address = base64ToAddress(result.addressBase64)
  await AsyncStorage.multiSet([
    [STORAGE_KEY_AUTH_TOKEN, result.authToken],
    [STORAGE_KEY_ADDRESS, address],
  ])
  return accountFor(address)
}

/**
 * One-shot auth: authorize + sign the nonce message in a SINGLE MWA `transact`,
 * so the wallet opens ONCE (connect + sign in one foregrounded visit). This is
 * the legacy/proven shape.
 *
 * Every attempt is a FRESH authorize, we drop any stored session first and
 * pass `null` to `authorizeSession`. Reusing a token makes it `reauthorize`,
 * which can hand control back to the dapp mid-session and tear down the MWA
 * association WebSocket ("Cannot send in CLOSED") before `signMessages` runs.
 * Starting clean keeps the wallet foregrounded through both prompts and also
 * lets a linking user pick a different account (so this is correct for
 * `forceFresh` too, hence no `opts`).
 *
 * The auth message is built ONCE and the exact bytes signed are returned: the
 * server verifies the signature over that literal string (buildAuthMessage
 * stamps a fresh `Issued At` each call, so re-building would diverge).
 *
 * Exported for unit testing; the picker/consumers reach it via `adapter.authenticate`.
 */
export async function authenticate(
  buildMessage: (account: WalletAccount) => string,
): Promise<AuthenticateResult | null> {
  await AsyncStorage.multiRemove([STORAGE_KEY_AUTH_TOKEN, STORAGE_KEY_ADDRESS])
  try {
    return await withMwaRetry(async (wallet) => {
      const session = await authorizeSession(wallet, null)
      const address = base64ToAddress(session.addressBase64)
      const account = accountFor(address)
      const message = buildMessage(account)
      const [signed] = await wallet.signMessages({
        addresses: [session.addressBase64],
        payloads: [new TextEncoder().encode(message)],
      })
      await AsyncStorage.multiSet([
        [STORAGE_KEY_AUTH_TOKEN, session.authToken],
        [STORAGE_KEY_ADDRESS, address],
      ])
      return { account, signature: Buffer.from(signed).toString('base64'), message }
    })
  } catch (err) {
    // A decline is the user's answer, not a failure.
    if (err instanceof WalletError && err.code === 'declined') return null
    throw err
  }
}

async function signMessage(
  account: WalletAccount,
  message: string,
): Promise<SignMessageResult> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
  const messageBytes = new TextEncoder().encode(message)
  const signedBytes = await withMwaRetry(async (wallet) => {
    const session = await authorizeSession(wallet, stored)
    if (session.authToken !== stored) {
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_TOKEN, session.authToken)
    }
    const [signed] = await wallet.signMessages({
      addresses: [addressToBase64(account.address)],
      payloads: [messageBytes],
    })
    return signed
  })
  return { signature: Buffer.from(signedBytes).toString('base64'), message }
}

/**
 * Sign a server-built transaction in the wallet, then broadcast from the
 * app's own RPC connection. Signing-only inside the wallet avoids the
 * wallet hanging on its internal RPC call (which prevents the signing
 * prompt from appearing). Returns the tx signature (the client-ping
 * tx_ref).
 */
async function signAndSendTransaction(
  transaction: Transaction | VersionedTransaction,
  authToken: string | null,
  onNewAuthToken?: (token: string) => void,
  onSigned?: () => void,
): Promise<string> {
  const signed = await withMwaRetry(async (wallet) => {
    const session = await authorizeSession(wallet, authToken)
    if (session.authToken !== authToken) {
      onNewAuthToken?.(session.authToken)
    }
    const [signedTx] = await wallet.signTransactions({ transactions: [transaction] })
    return signedTx
  })

  const rawTx =
    signed instanceof VersionedTransaction
      ? signed.serialize()
      : (signed as Transaction).serialize()
  const signatureBytes = signed instanceof VersionedTransaction
    ? signed.signatures[0]
    : (signed as Transaction).signature
  if (signatureBytes === undefined || signatureBytes === null) {
    throw new WalletError('unknown', 'Wallet returned a transaction without a signature')
  }
  const signature = bs58.encode(signatureBytes)
  onSigned?.()
  try {
    return await solanaRpcTransport.broadcast(rawTx, signature)
  } catch (error) {
    if (isRetryableSolanaRpcError(error)) {
      throw new WalletError('network', TRANSACTION_COPY.solanaBroadcastUncertain, error)
    }
    throw error
  }
}

/**
 * Sign + broadcast a server-built tx using THIS adapter's MWA session. The
 * adapter owns its session (AsyncStorage), dispatch no longer threads the token
 * through the auth store, so there is a SINGLE source of truth.
 *
 * A stored token is REUSED (reauthorize) when present; when absent we pass
 * `null` and `authorizeSession` does a fresh `authorize()` — the wallet opens,
 * the user approves this device, and signing proceeds in the same MWA visit.
 * We do NOT dead-end on a missing device token: whether the user is linked is a
 * `wallets[]` question resolved upstream at the action gate, not a device-local
 * one. A rotated/fresh token is persisted for reuse. (If the user authorizes an
 * account other than the escrow's signer, the server-built tx's fixed signer
 * makes the broadcast fail downstream — the on-chain guard, not a client one.)
 */
export async function signAndSendStored(
  transaction: Transaction | VersionedTransaction,
  onSigned?: () => void,
): Promise<string> {
  const token = await AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
  return signAndSendTransaction(
    transaction,
    token,
    (rotated) => { void AsyncStorage.setItem(STORAGE_KEY_AUTH_TOKEN, rotated) },
    onSigned,
  )
}

async function disconnect(): Promise<void> {
  // Local-only. MWA `deauthorize()` requires a wallet round-trip via
  // `transact()`, which would open the wallet just to send a revoke message.
  // The stored auth token is harmless on the wallet side (auto-expires; user
  // can revoke from the wallet's connected-dapps UI if they want).
  await AsyncStorage.multiRemove([STORAGE_KEY_AUTH_TOKEN, STORAGE_KEY_ADDRESS])
}

async function getRestoredAccount(): Promise<WalletAccount | null> {
  const [token, address] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN),
    AsyncStorage.getItem(STORAGE_KEY_ADDRESS),
  ])
  if (!token || !address) return null
  return accountFor(address)
}

const unavailable = (op: string) => () => {
  throw new Error(`solana-mwa: ${op} unavailable on ${Platform.OS}`)
}

export const solanaMwaAdapter: WalletAdapter = {
  id: ADAPTER_ID,
  name: 'Solana Wallet',
  tagline: 'Solflare, Phantom & more',
  iconSource: require('@/assets/wallets/Solana.png'),
  namespaces: ['solana'],
  isAvailable: async () => Platform.OS === 'android',
  // The OS-level chooser is what surfaces "installed Solana wallets" on
  // Android, we can't probe individual wallets here without a target. So we
  // return true unconditionally and let MWA report "no installed wallet" at
  // connect time if there genuinely is none.
  isInstalled: async () => true,
  connect: Platform.OS === 'android' ? connect : unavailable('connect'),
  signMessage: Platform.OS === 'android' ? signMessage : unavailable('signMessage'),
  authenticate: Platform.OS === 'android' ? authenticate : unavailable('authenticate'),
  disconnect: Platform.OS === 'android' ? disconnect : unavailable('disconnect'),
  getRestoredAccount:
    Platform.OS === 'android' ? getRestoredAccount : async () => null,
}
