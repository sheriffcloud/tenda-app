import { Platform, Linking } from 'react-native'
import { Buffer } from 'buffer'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as SecureStore from 'expo-secure-store'
import { WalletError } from '@/wallet/errors'
import { metadata, SOLANA_NETWORK, WALLET_CHAINS } from '../config'
import { canOpenScheme } from './detect'
import { connectThenSign } from './connect-then-sign'
import type { AuthenticateResult, WalletAdapter } from './types'
import type { SignMessageResult, SpikeAccount } from '../types'

/**
 * Phantom on iOS via Phantom's encrypted universal-link protocol
 * (docs.phantom.app › deeplinks): an X25519 dapp keypair performs ECDH
 * with Phantom's per-connection key; request payloads and responses are
 * nacl.box envelopes riding URL query params, and Phantom bounces back to
 * our `tenda://phantom/...` redirect links.
 *
 * Android-Solana is handled by the generic `solanaMwaAdapter` (MWA routes
 * to whatever Solana wallet the OS opens), so this adapter only reports
 * `isAvailable: true` on iOS.
 *
 * ⚠ W1 (#35): implemented to the documented protocol; needs verification
 * on a physical iOS device with Phantom installed, universal-link
 * round-trips cannot be exercised in CI or a simulator without the
 * wallet app.
 */

const UL_BASE = 'https://phantom.app/ul/v1'
const REDIRECT_PREFIX = `${metadata.redirectScheme}://phantom`
/** SecureStore key for the persisted session bundle. */
const SESSION_KEY = 'phantom_ul_session'
/** Give the user ample time to approve in the wallet UI. */
const RESPONSE_TIMEOUT_MS = 120_000
/** Phantom's "user rejected request" deeplink error code. */
const PHANTOM_USER_REJECTED = '4001'

interface StoredSession {
  /** Phantom's opaque session token, sent inside every signed payload. */
  session: string
  /** Connected wallet address (base58). */
  wallet_pubkey: string
  /** Our X25519 secret key (base58), pairs with Phantom's key for ECDH. */
  dapp_secret_b58: string
  /** Phantom's encryption public key (base58). */
  phantom_pubkey_b58: string
}

function sharedSecret(s: Pick<StoredSession, 'dapp_secret_b58' | 'phantom_pubkey_b58'>): Uint8Array {
  return nacl.box.before(bs58.decode(s.phantom_pubkey_b58), bs58.decode(s.dapp_secret_b58))
}

function dappPublicKeyB58(s: Pick<StoredSession, 'dapp_secret_b58'>): string {
  return bs58.encode(nacl.box.keyPair.fromSecretKey(bs58.decode(s.dapp_secret_b58)).publicKey)
}

function encryptPayload(
  payload: Record<string, unknown>,
  secret: Uint8Array,
): { nonce: string; data: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const sealed = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, secret)
  return { nonce: bs58.encode(nonce), data: bs58.encode(sealed) }
}

function decryptPayload(dataB58: string, nonceB58: string, secret: Uint8Array): Record<string, unknown> {
  const opened = nacl.box.open.after(bs58.decode(dataB58), bs58.decode(nonceB58), secret)
  if (opened === null) throw new Error('phantom: response payload failed to decrypt')
  return JSON.parse(new TextDecoder().decode(opened)) as Record<string, unknown>
}

function queryParams(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  const qs = url.split('?')[1]
  if (qs === undefined) return out
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=')
    if (k !== undefined && v !== undefined) out[decodeURIComponent(k)] = decodeURIComponent(v)
  }
  return out
}

/**
 * Open a universal link and resolve with the params of the matching
 * redirect. One in-flight request at a time, Phantom serializes its
 * approval UI anyway.
 */
async function roundTrip(url: string, redirectPath: string): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const expected = `${REDIRECT_PREFIX}/${redirectPath}`
    const timer = setTimeout(() => {
      subscription.remove()
      reject(new Error('phantom: timed out waiting for the wallet to respond'))
    }, RESPONSE_TIMEOUT_MS)

    const subscription = Linking.addEventListener('url', ({ url: incoming }) => {
      if (!incoming.startsWith(expected)) return
      clearTimeout(timer)
      subscription.remove()
      const params = queryParams(incoming)
      if (params.errorCode !== undefined) {
        // Surface a user-decline as the typed WalletError every transport uses
        // so connectThenSign maps it to `null` instead of a hard error.
        if (params.errorCode === PHANTOM_USER_REJECTED) {
          reject(new WalletError('declined', 'Wallet request declined'))
        } else {
          reject(new Error(`phantom: ${params.errorMessage ?? `error ${params.errorCode}`}`))
        }
        return
      }
      resolve(params)
    })

    Linking.openURL(url).catch((err: unknown) => {
      clearTimeout(timer)
      subscription.remove()
      reject(err instanceof Error ? err : new Error('phantom: could not open the wallet'))
    })
  })
}

async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

function toAccount(s: StoredSession): SpikeAccount {
  return {
    chainId: WALLET_CHAINS.solana,
    namespace: 'solana',
    address: s.wallet_pubkey,
    walletId: 'phantom',
  }
}

async function connect(): Promise<SpikeAccount> {
  const dappKeypair = nacl.box.keyPair()
  const params = new URLSearchParams({
    app_url: metadata.url,
    dapp_encryption_public_key: bs58.encode(dappKeypair.publicKey),
    redirect_link: `${REDIRECT_PREFIX}/connect`,
    cluster: SOLANA_NETWORK,
  })
  const response = await roundTrip(`${UL_BASE}/connect?${params.toString()}`, 'connect')

  const phantomPub = response.phantom_encryption_public_key
  const nonce = response.nonce
  const data = response.data
  if (phantomPub === undefined || nonce === undefined || data === undefined) {
    throw new Error('phantom: connect response missing encryption params')
  }
  const secret = nacl.box.before(bs58.decode(phantomPub), dappKeypair.secretKey)
  const payload = decryptPayload(data, nonce, secret)
  const wallet_pubkey = payload.public_key
  const session = payload.session
  if (typeof wallet_pubkey !== 'string' || typeof session !== 'string') {
    throw new Error('phantom: connect payload missing public_key/session')
  }

  const stored: StoredSession = {
    session,
    wallet_pubkey,
    dapp_secret_b58: bs58.encode(dappKeypair.secretKey),
    phantom_pubkey_b58: phantomPub,
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(stored))
  return toAccount(stored)
}

async function signMessage(_account: SpikeAccount, message: string): Promise<SignMessageResult> {
  const stored = await loadSession()
  if (stored === null) throw new Error('phantom: not connected')
  const secret = sharedSecret(stored)
  const { nonce, data } = encryptPayload(
    {
      message: bs58.encode(new TextEncoder().encode(message)),
      session: stored.session,
      display: 'utf8',
    },
    secret,
  )
  const params = new URLSearchParams({
    dapp_encryption_public_key: dappPublicKeyB58(stored),
    nonce,
    redirect_link: `${REDIRECT_PREFIX}/sign-message`,
    payload: data,
  })
  const response = await roundTrip(`${UL_BASE}/signMessage?${params.toString()}`, 'sign-message')
  if (response.data === undefined || response.nonce === undefined) {
    throw new Error('phantom: sign response missing payload')
  }
  const payload = decryptPayload(response.data, response.nonce, secret)
  if (typeof payload.signature !== 'string') {
    throw new Error('phantom: sign payload missing signature')
  }
  // Phantom returns the signature base58-encoded; the server's Solana
  // verifier (verifyEd25519) decodes base64, so normalise here, every
  // Solana adapter must hand the server base64 (matches solana-mwa).
  return { signature: Buffer.from(bs58.decode(payload.signature)).toString('base64'), message }
}

async function disconnect(): Promise<void> {
  const stored = await loadSession()
  await SecureStore.deleteItemAsync(SESSION_KEY)
  if (stored === null) return
  try {
    const secret = sharedSecret(stored)
    const { nonce, data } = encryptPayload({ session: stored.session }, secret)
    const params = new URLSearchParams({
      dapp_encryption_public_key: dappPublicKeyB58(stored),
      nonce,
      redirect_link: `${REDIRECT_PREFIX}/disconnect`,
      payload: data,
    })
    await roundTrip(`${UL_BASE}/disconnect?${params.toString()}`, 'disconnect')
  } catch {
    // Local session is already gone, a failed remote disconnect is benign.
  }
}

async function getRestoredAccount(): Promise<SpikeAccount | null> {
  const stored = await loadSession()
  return stored === null ? null : toAccount(stored)
}

function authenticate(
  buildMessage: (account: SpikeAccount) => string,
  opts?: { forceFresh?: boolean },
): Promise<AuthenticateResult | null> {
  return connectThenSign({ connect, signMessage, disconnect }, buildMessage, opts)
}

export const phantomAdapter: WalletAdapter = {
  id: 'phantom',
  name: 'Phantom',
  iconSource: require('@/assets/wallets/phantom.png'),
  namespaces: ['solana'],
  isAvailable: async () => Platform.OS === 'ios',
  isInstalled: () => canOpenScheme('phantom'),
  connect,
  signMessage,
  authenticate,
  disconnect,
  getRestoredAccount,
}
