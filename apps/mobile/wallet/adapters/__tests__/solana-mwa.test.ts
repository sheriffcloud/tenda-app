/**
 * solana-mwa.signAndSendStored (Stage 3). The adapter owns its MWA session
 * token (AsyncStorage), dispatch reads it from here, not the auth store.
 * Verifies the no-session guard and the connect→sign→broadcast happy path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { waitFor } from '@testing-library/react-native'

jest.mock('../mwa-shared', () => ({
  withMwaRetry: jest.fn(),
  authorizeSession: jest.fn(),
}))

const mockBroadcast = jest.fn(async (_raw: Uint8Array, signature: string) => signature)
jest.mock('@/wallet/solana-rpc', () => ({
  // The classifier is NOT mocked since its move to @tenda/shared: the real
  // one runs, and the test's TypeError is a genuine transport failure to it.
  solanaRpcTransport: { broadcast: (...args: [Uint8Array, string]) => mockBroadcast(...args) },
}))

jest.mock('@solana/web3.js', () => {
  class VersionedTransaction {}
  class Transaction {
    signature = new Uint8Array(64).fill(1)
    serialize() {
      return new Uint8Array([1, 2, 3])
    }
  }
  return {
    Connection: jest.fn().mockImplementation(() => ({
      sendRawTransaction: jest.fn(async () => 'broadcast-sig'),
    })),
    clusterApiUrl: () => 'http://rpc',
    PublicKey: class {
      toBase58() {
        return 'MockAddr'
      }
      toBytes() {
        return new Uint8Array(32)
      }
    },
    VersionedTransaction,
    Transaction,
  }
})

import { signAndSendStored, authenticate } from '../solana-mwa'
import { WalletError } from '@tenda/shared'
import { withMwaRetry, authorizeSession } from '../mwa-shared'
import { Transaction } from '@solana/web3.js'
import type { WalletAccount } from '@tenda/shared'

const STORAGE_KEY = 'wallet.solana-mwa.authToken'
const withRetryMock = withMwaRetry as jest.Mock
const authorizeMock = authorizeSession as jest.Mock

beforeEach(async () => {
  await AsyncStorage.clear()
  withRetryMock.mockReset()
  authorizeMock.mockReset()
  mockBroadcast.mockClear()
})

describe('signAndSendStored', () => {
  it('signs with the stored token and returns the broadcast signature', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'tok-1')
    const tx = new Transaction()
    // The adapter signs inside withMwaRetry's callback; the signed tx is what
    // gets serialized + broadcast. Return the same VersionedTransaction.
    withRetryMock.mockImplementation(async () => tx)

    const ref = await signAndSendStored(tx)

    expect(ref).toBeTruthy()
    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    expect(withRetryMock).toHaveBeenCalledTimes(1)
  })

  it('announces signing completion before awaiting the RPC broadcast', async () => {
    const tx = new Transaction()
    withRetryMock.mockImplementation(async () => tx)
    let releaseBroadcast: (() => void) | undefined
    mockBroadcast.mockImplementationOnce(() => new Promise<string>((resolve) => {
      releaseBroadcast = () => resolve('sig')
    }))
    const onSigned = jest.fn()

    const pending = signAndSendStored(tx, onSigned)
    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1))

    releaseBroadcast?.()
    await expect(pending).resolves.toBe('sig')
  })

  it('maps exhausted transport failure to an ambiguous network outcome', async () => {
    const tx = new Transaction()
    withRetryMock.mockImplementation(async () => tx)
    mockBroadcast.mockRejectedValueOnce(new TypeError('Network request failed'))

    await expect(signAndSendStored(tx)).rejects.toMatchObject({
      code: 'network',
      message: expect.stringMatching(/could not confirm whether Solana received/i),
    })
  })

  it('acquires a session on demand (fresh authorize) when the device has no stored token', async () => {
    // No stored token: linkage is a wallets[] question resolved upstream, so
    // the adapter must NOT dead-end — it authorizes fresh and signs in one visit.
    const tx = new Transaction()
    const wallet = {
      signTransactions: jest.fn(async ({ transactions }: { transactions: Transaction[] }) => transactions),
    }
    // authorizeSession sees null (no stored token) and returns a fresh session.
    authorizeMock.mockResolvedValue({ authToken: 'fresh-tok', addressBase64: 'AAAA' })
    withRetryMock.mockImplementation((op: (w: typeof wallet) => Promise<unknown>) => op(wallet))

    const ref = await signAndSendStored(tx)

    expect(authorizeMock).toHaveBeenCalledWith(wallet, null)
    expect(wallet.signTransactions).toHaveBeenCalled()
    expect(ref).toBeTruthy()
    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    // The fresh token is persisted for reuse on the next signature.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('fresh-tok')
  })
})

describe('authenticate (one-shot, always-fresh)', () => {
  it('drops any stored session, authorizes fresh, signs once, returns the exact signed message', async () => {
    // A leftover token from a prior attempt must NOT trigger a reauthorize.
    await AsyncStorage.setItem(STORAGE_KEY, 'stale-token')
    authorizeMock.mockResolvedValue({ authToken: 'fresh-tok', addressBase64: 'AAAA' })

    const captured: { payload?: Uint8Array } = {}
    const wallet = {
      signMessages: jest.fn(async ({ payloads }: { addresses: string[]; payloads: Uint8Array[] }) => {
        captured.payload = payloads[0]
        return [new Uint8Array([9, 9, 9])]
      }),
    }
    // Single transact: run the op once against the fake wallet.
    withRetryMock.mockImplementation((op: (w: typeof wallet) => Promise<unknown>) => op(wallet))

    // buildMessage changes each call (mirrors buildAuthMessage's fresh Issued At)
    // so a build-once bug would surface as signed-message ≠ returned-message.
    let n = 0
    const buildMessage = (a: WalletAccount): string => `MSG:${a.address}:${n++}`

    const result = await authenticate(buildMessage)
    if (result === null) throw new Error('expected an AuthenticateResult')

    // Fresh authorize (null token), never reauthorize with the stale one.
    expect(authorizeMock).toHaveBeenCalledWith(wallet, null)
    // One wallet visit.
    expect(withRetryMock).toHaveBeenCalledTimes(1)
    // The exact bytes signed are what we return (build-once invariant).
    expect(new TextDecoder().decode(captured.payload)).toBe(result.message)
    expect(result.account.address).toBe('MockAddr')
    expect(result.account.namespace).toBe('solana')
    // Rotated token persisted, replacing the stale one.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('fresh-tok')
  })

  it('returns null when the user declines', async () => {
    withRetryMock.mockRejectedValue(new WalletError('declined', 'no'))
    expect(await authenticate(() => 'm')).toBeNull()
  })

  it('rethrows non-decline errors', async () => {
    withRetryMock.mockRejectedValue(new Error('boom'))
    await expect(authenticate(() => 'm')).rejects.toThrow('boom')
  })
})
