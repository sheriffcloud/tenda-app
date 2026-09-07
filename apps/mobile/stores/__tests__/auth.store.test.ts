/**
 * Auth store, wallet sign-in + session lifecycle (Stage 3). Covers the
 * namespace-aware address publishing (Solana → walletAddress + SecureStore;
 * EVM → evmAddress, no Solana persist), decline → false, server-error
 * propagation, logout reset, and loadSession's three branches (no-jwt,
 * happy, 401-clears vs transient-network-keeps).
 */
import type { ImageRequireSource } from 'react-native'
import type { AuthResponse } from '@tenda/shared'
import type { WalletAdapter } from '@/wallet/adapters/types'
import type { Namespace, SpikeAccount } from '@/wallet/types'

jest.mock('@/wallet/auth', () => ({
  signInWithWallet: jest.fn(),
  linkWalletWith: jest.fn(),
}))

jest.mock('@/api/client', () => {
  // Defined inside the factory (jest hoists mocks above imports, an
  // out-of-scope class reference is disallowed). The store's `instanceof
  // ApiClientError` matches because both sides resolve to this same class.
  class ApiClientError extends Error {
    statusCode: number
    code?: string
    constructor(statusCode: number, error: string, message: string, code?: string) {
      super(message)
      this.statusCode = statusCode
      this.code = code
    }
  }
  return {
    api: {
      auth: { me: jest.fn(), verify: jest.fn(), methods: jest.fn() },
      users: { me: jest.fn() },
    },
    ApiClientError,
  }
})

jest.mock('@/lib/secure-store', () => ({
  getJwtToken: jest.fn(),
  setJwtToken: jest.fn(async () => {}),
  getWalletAddress: jest.fn(),
  setWalletAddress: jest.fn(async () => {}),
  clearAuthStorage: jest.fn(async () => {}),
}))

jest.mock('@/stores/pending-sync.store', () => ({
  usePendingSyncStore: { getState: () => ({ clear: jest.fn(async () => {}) }) },
}))

import { act, renderHook } from '@testing-library/react-native'
import { useAuthStore, useIsSeeker } from '@/stores/auth.store'
import { signInWithWallet as walletSignIn, linkWalletWith } from '@/wallet/auth'
import { api, ApiClientError } from '@/api/client'
import {
  getJwtToken,
  getWalletAddress,
  setWalletAddress,
  setJwtToken,
  clearAuthStorage,
} from '@/lib/secure-store'

const walletSignInMock = walletSignIn as jest.Mock
const linkWalletMock = linkWalletWith as jest.Mock
const meMock = api.auth.me as jest.Mock
const verifyMock = api.auth.verify as jest.Mock
const methodsMock = api.auth.methods as jest.Mock
const usersMeMock = api.users.me as jest.Mock
const getJwt = getJwtToken as jest.Mock
const getAddr = getWalletAddress as jest.Mock
const setAddr = setWalletAddress as jest.Mock
const setJwt = setJwtToken as jest.Mock
const clearAuth = clearAuthStorage as jest.Mock

/** The JWT guard's rejection of a stale bearer (plugins/auth.ts envelope). */
function staleTokenError(): InstanceType<typeof ApiClientError> {
  return new ApiClientError(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
}

const USER: AuthResponse['user'] = {
  id: 'u1',
  first_name: 'Ada',
  last_name: 'Lovelace',
} as AuthResponse['user']

const AUTH: AuthResponse = { token: 'jwt-123', user: USER }

function account(namespace: Namespace): SpikeAccount {
  return namespace === 'solana'
    ? { namespace, chainId: 'solana:devnet', address: 'SoLaNaAddr', walletId: 'solana-mwa' }
    : { namespace, chainId: 'eip155:84532', address: '0xEvmAddr', walletId: 'metamask' }
}

function stubAdapter(): WalletAdapter {
  return {
    id: 'solana-mwa',
    name: 'Solana Wallet',
    iconSource: 0 as ImageRequireSource,
    namespaces: ['solana'],
    isAvailable: jest.fn(async () => true),
    isInstalled: jest.fn(async () => true),
    connect: jest.fn(),
    signMessage: jest.fn(),
    authenticate: jest.fn(),
    disconnect: jest.fn(async () => {}),
    getRestoredAccount: jest.fn(async () => null),
  }
}

const INITIAL = {
  user: null,
  jwt: null,
  walletAddress: null,
  evmAddress: null,
  isAuthenticated: false,
  isLoading: true,
  wallets: [],
  walletsStatus: 'idle' as const,
  profileComplete: null,
  identities: [],
}

beforeEach(() => {
  useAuthStore.setState(INITIAL)
  meMock.mockResolvedValue(USER)
  usersMeMock.mockResolvedValue({
    wallets: [],
    profile_complete: true,
    user: { phone_verified_at: null },
  })
})

describe('signInWithWallet', () => {
  it('publishes a Solana account to walletAddress + SecureStore', async () => {
    walletSignInMock.mockResolvedValue({ auth: AUTH, account: account('solana') })
    // The signed-in wallet is linked, so the reconcile (refreshMe) keeps it.
    usersMeMock.mockResolvedValue({
      wallets: [{ chain_ns: 'solana', address: 'SoLaNaAddr', is_primary: true, verified_at: 'now' }],
      profile_complete: true,
    })

    const ok = await useAuthStore.getState().signInWithWallet(stubAdapter())

    expect(ok).toBe(true)
    const s = useAuthStore.getState()
    expect(s.walletAddress).toBe('SoLaNaAddr')
    expect(s.evmAddress).toBeNull()
    expect(s.isAuthenticated).toBe(true)
    expect(s.profileComplete).toBe(true)
    expect(setJwt).toHaveBeenCalledWith('jwt-123')
    expect(setAddr).toHaveBeenCalledWith('SoLaNaAddr')
    // Find-or-reject: the adapter is the sole argument, no signup bootstrap.
    expect(walletSignInMock.mock.calls[0]).toHaveLength(1)
  })

  it('publishes an EVM account to evmAddress only, no Solana persist', async () => {
    walletSignInMock.mockResolvedValue({ auth: AUTH, account: account('eip155') })
    usersMeMock.mockResolvedValue({
      wallets: [{ chain_ns: 'eip155', address: '0xEvmAddr', is_primary: true, verified_at: 'now' }],
      profile_complete: true,
    })

    const ok = await useAuthStore.getState().signInWithWallet(stubAdapter())

    expect(ok).toBe(true)
    const s = useAuthStore.getState()
    expect(s.evmAddress).toBe('0xEvmAddr')
    expect(s.walletAddress).toBeNull()
    expect(setAddr).not.toHaveBeenCalled()
  })

  it('marks profileComplete false (sign-in derived) when names are missing', async () => {
    walletSignInMock.mockResolvedValue({
      auth: { token: 't', user: { id: 'u2' } as AuthResponse['user'] },
      account: account('solana'),
    })
    // Background refreshMe fails → the value derived at sign-in is the fallback.
    // Terminal (401) so it does NOT schedule a retry timer that would outlive
    // this test (refreshMe is fired fire-and-forget by sign-in).
    usersMeMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'me down', 'UNAUTHORIZED'))
    await useAuthStore.getState().signInWithWallet(stubAdapter())
    expect(useAuthStore.getState().profileComplete).toBe(false)
  })

  it('marks profileComplete false when the names are whitespace-only', async () => {
    // #47. The old predicate was `Boolean(first && last)`, and two spaces pass
    // it — so this session went straight to the home tabs, showed "Anonymous"
    // everywhere, and was then refused by the server's create/accept guard.
    // Distinct from the case above: those names are ABSENT, these are present
    // and blank, which is the half that used to slip through.
    walletSignInMock.mockResolvedValue({
      auth: {
        token: 't',
        user: { id: 'u3', first_name: '  ', last_name: '  ' } as AuthResponse['user'],
      },
      account: account('solana'),
    })
    usersMeMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'me down', 'UNAUTHORIZED'))
    await useAuthStore.getState().signInWithWallet(stubAdapter())
    expect(useAuthStore.getState().profileComplete).toBe(false)
  })

  it('returns false on decline and leaves the session untouched', async () => {
    walletSignInMock.mockResolvedValue(null)
    const ok = await useAuthStore.getState().signInWithWallet(stubAdapter())
    expect(ok).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(setJwt).not.toHaveBeenCalled()
  })

  it('flags walletAuthInProgress true mid-flight and clears it after (success)', async () => {
    let release: (v: { auth: typeof AUTH; account: ReturnType<typeof account> }) => void = () => {}
    walletSignInMock.mockReturnValue(new Promise((res) => { release = res }))

    const pending = useAuthStore.getState().signInWithWallet(stubAdapter())
    expect(useAuthStore.getState().walletAuthInProgress).toBe(true)

    release({ auth: AUTH, account: account('eip155') })
    await pending
    expect(useAuthStore.getState().walletAuthInProgress).toBe(false)
  })

  it('clears walletAuthInProgress even when sign-in throws', async () => {
    walletSignInMock.mockRejectedValue(new Error('boom'))
    await expect(useAuthStore.getState().signInWithWallet(stubAdapter())).rejects.toThrow('boom')
    expect(useAuthStore.getState().walletAuthInProgress).toBe(false)
  })

  it('propagates a server/transport failure', async () => {
    walletSignInMock.mockRejectedValue(new Error('500 boom'))
    await expect(useAuthStore.getState().signInWithWallet(stubAdapter())).rejects.toThrow('500 boom')
  })

  it('purges the stored session when the wallet flow 401s UNAUTHORIZED (stale token)', async () => {
    useAuthStore.setState({ jwt: 'dead-jwt' })
    walletSignInMock.mockRejectedValue(staleTokenError())

    await expect(useAuthStore.getState().signInWithWallet(stubAdapter())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().jwt).toBeNull()
    expect(useAuthStore.getState().walletAuthInProgress).toBe(false)
  })
})

describe('linkWallet', () => {
  it('links a wallet, refreshes wallets[], and returns true', async () => {
    linkWalletMock.mockResolvedValue(account('eip155'))
    usersMeMock.mockResolvedValueOnce({
      wallets: [{ chain_ns: 'eip155', address: '0xEvmAddr', is_primary: false, verified_at: 'now' }],
      profile_complete: true,
      user: { phone_verified_at: null },
    })

    const ok = await useAuthStore.getState().linkWallet(stubAdapter())

    expect(ok).toBe(true)
    expect(linkWalletMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().wallets).toHaveLength(1)
    // Linking never mints/replaces the session JWT.
    expect(setJwt).not.toHaveBeenCalled()
  })

  it('returns false on decline (null) without refreshing', async () => {
    linkWalletMock.mockResolvedValue(null)
    usersMeMock.mockClear()
    const ok = await useAuthStore.getState().linkWallet(stubAdapter())
    expect(ok).toBe(false)
    expect(usersMeMock).not.toHaveBeenCalled()
  })

  it('flags walletAuthInProgress true mid-flight, clears it after success', async () => {
    let release: (v: ReturnType<typeof account>) => void = () => {}
    linkWalletMock.mockReturnValue(new Promise((res) => { release = res }))

    const pending = useAuthStore.getState().linkWallet(stubAdapter())
    expect(useAuthStore.getState().walletAuthInProgress).toBe(true)

    release(account('eip155'))
    await pending
    expect(useAuthStore.getState().walletAuthInProgress).toBe(false)
  })

  it('clears walletAuthInProgress and propagates when link throws (e.g. 409)', async () => {
    linkWalletMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'already linked'))
    await expect(useAuthStore.getState().linkWallet(stubAdapter())).rejects.toBeInstanceOf(ApiClientError)
    expect(useAuthStore.getState().walletAuthInProgress).toBe(false)
  })
})

describe('signInWithVerify', () => {
  it('sets a walletless session from the verify response and returns is_new', async () => {
    verifyMock.mockResolvedValue({ token: 'jwt-v', user: USER, is_new: true })

    const { isNew } = await useAuthStore.getState().signInWithVerify({
      method: 'email',
      identifier: 'a@x.io',
      code: '123456',
    })

    expect(isNew).toBe(true)
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.user).toEqual(USER)
    expect(s.jwt).toBe('jwt-v')
    expect(s.walletAddress).toBeNull() // no wallet on a credential sign-in
    expect(s.profileComplete).toBe(true)
    expect(setJwt).toHaveBeenCalledWith('jwt-v')
  })

  it('passes is_new=false through for an existing-account login', async () => {
    verifyMock.mockResolvedValue({ token: 't', user: USER, is_new: false })
    const { isNew } = await useAuthStore.getState().signInWithVerify({ method: 'phone', identifier: '+1', code: '1' })
    expect(isNew).toBe(false)
  })

  it('propagates a verify failure (e.g. WALLET_NOT_LINKED) to the caller', async () => {
    verifyMock.mockRejectedValue(new ApiClientError(404, 'Not Found', 'wallet not linked'))
    await expect(
      useAuthStore.getState().signInWithVerify({
        method: 'wallet',
        chain_id: 'solana:devnet',
        address: 'A',
        message: 'm',
        signature: 's',
      }),
    ).rejects.toBeInstanceOf(ApiClientError)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('calls verify ANONYMOUSLY, sign-in never passes link intent', async () => {
    verifyMock.mockResolvedValue({ token: 't', user: USER, is_new: false })
    const body = { method: 'google' as const, id_token: 'g-idt' }
    await useAuthStore.getState().signInWithVerify(body)
    // Exactly one argument: no { link: true }, so the request layer sends no
    // bearer and a stale stored JWT can never 401 a sign-in.
    expect(verifyMock).toHaveBeenCalledWith(body)
  })

  it('purges the stored session when verify 401s UNAUTHORIZED (stale token), so retry works', async () => {
    // The repro: app launched with the server down → loadSession kept a dead
    // token → server comes up → sign-in 401s. The purge must clear storage.
    useAuthStore.setState({ jwt: 'dead-jwt', walletAddress: 'SoLaNaAddr' })
    verifyMock.mockRejectedValue(staleTokenError())

    await expect(
      useAuthStore.getState().signInWithVerify({ method: 'google', id_token: 'g-idt' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    expect(clearAuth).toHaveBeenCalledTimes(1)
    const s = useAuthStore.getState()
    expect(s.jwt).toBeNull()
    expect(s.walletAddress).toBeNull()
    expect(s.isAuthenticated).toBe(false)
  })

  it('does NOT purge storage on other verify failures (e.g. bad OTP)', async () => {
    verifyMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'Invalid code', 'OTP_INVALID'))
    await expect(
      useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'a@x.io', code: '000000' }),
    ).rejects.toBeInstanceOf(ApiClientError)
    expect(clearAuth).not.toHaveBeenCalled()
  })
})

describe('refreshMe (session reconcile against wallets[])', () => {
  it('keeps session addresses that are still verified linked wallets', async () => {
    useAuthStore.setState({ walletAddress: 'SoLAddr', evmAddress: '0xEvm' })
    usersMeMock.mockResolvedValue({
      wallets: [
        { chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: 'now' },
        { chain_ns: 'eip155', address: '0xEvm', is_primary: true, verified_at: 'now' },
      ],
      profile_complete: true,
    })
    await useAuthStore.getState().refreshMe()
    const s = useAuthStore.getState()
    expect(s.walletAddress).toBe('SoLAddr')
    expect(s.evmAddress).toBe('0xEvm')
  })

  it('drops a session address that is no longer a linked wallet (unlinked)', async () => {
    useAuthStore.setState({ walletAddress: 'SoLAddr', evmAddress: '0xStale' })
    usersMeMock.mockResolvedValue({
      wallets: [{ chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: 'now' }],
      profile_complete: true,
    })
    await useAuthStore.getState().refreshMe()
    const s = useAuthStore.getState()
    expect(s.walletAddress).toBe('SoLAddr') // still linked → kept
    expect(s.evmAddress).toBeNull() // unlinked → dropped
  })

  it('leaves session addresses untouched when the fetch fails outright', async () => {
    useAuthStore.setState({ walletAddress: 'SoLAddr', evmAddress: '0xEvm' })
    // Terminal failure (401) — not retried, so the reconcile never runs and the
    // slots are preserved. (A single transient reject now RECOVERS via retry.)
    usersMeMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'x', 'UNAUTHORIZED'))
    await useAuthStore.getState().refreshMe()
    const s = useAuthStore.getState()
    expect(s.walletAddress).toBe('SoLAddr')
    expect(s.evmAddress).toBe('0xEvm')
  })
})

describe('logout', () => {
  it('clears credentials and session state', async () => {
    useAuthStore.setState({
      user: USER,
      jwt: 'jwt-123',
      walletAddress: 'SoLaNaAddr',
      evmAddress: '0xEvmAddr',
      isAuthenticated: true,
    })
    await useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.jwt).toBeNull()
    expect(s.walletAddress).toBeNull()
    expect(s.evmAddress).toBeNull()
    expect(s.isAuthenticated).toBe(false)
  })
})

describe('loadSession', () => {
  /**
   * loadSession fires refreshMe WITHOUT awaiting it (navigation only needs
   * profile_complete), so its effects land a tick later. One macrotask is
   * enough: the assertions below use paths that never reach withRetry's
   * backoff sleeps (success, or a terminal 401).
   */
  const waitForWalletsSettled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  it('settles unauthenticated when no jwt is stored', async () => {
    getJwt.mockResolvedValue(null)
    getAddr.mockResolvedValue(null)
    await useAuthStore.getState().loadSession()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
    expect(meMock).not.toHaveBeenCalled()
  })

  it('restores the session when a jwt resolves', async () => {
    getJwt.mockResolvedValue('jwt-123')
    getAddr.mockResolvedValue('SoLaNaAddr')
    // Background refreshMe reconciles the restored address against wallets[];
    // it stays because it's a verified linked wallet.
    usersMeMock.mockResolvedValue({
      wallets: [{ chain_ns: 'solana', address: 'SoLaNaAddr', is_primary: true, verified_at: 'now' }],
      profile_complete: true,
    })
    await useAuthStore.getState().loadSession()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.user).toEqual(USER)
    expect(s.walletAddress).toBe('SoLaNaAddr')
  })

  it('clears storage on a 401', async () => {
    getJwt.mockResolvedValue('stale')
    getAddr.mockResolvedValue('SoLaNaAddr')
    meMock.mockRejectedValueOnce(new ApiClientError(401, 'Unauthorized', 'unauthorized'))
    await useAuthStore.getState().loadSession()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.jwt).toBeNull()
  })

  it('clears storage on a 403 as well', async () => {
    // The other half of the terminal branch: a banned/aged-out token is not a
    // transient blip, so the credential goes and nothing is retried with it.
    getJwt.mockResolvedValue('revoked')
    getAddr.mockResolvedValue('SoLaNaAddr')
    meMock.mockRejectedValueOnce(new ApiClientError(403, 'Forbidden', 'forbidden'))

    await useAuthStore.getState().loadSession()
    await waitForWalletsSettled()

    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.jwt).toBeNull()
    expect(clearAuth).toHaveBeenCalled()
    expect(usersMeMock).not.toHaveBeenCalled()
  })

  it('keeps credentials on a transient network error, without a wallets load', async () => {
    getJwt.mockResolvedValue('jwt-123')
    getAddr.mockResolvedValue('SoLaNaAddr')
    meMock.mockRejectedValueOnce(new Error('network down'))

    await useAuthStore.getState().loadSession()
    await waitForWalletsSettled()

    const s = useAuthStore.getState()
    expect(s.jwt).toBe('jwt-123')
    expect(s.walletAddress).toBe('SoLaNaAddr')
    expect(s.isLoading).toBe(false)
    // This branch leaves the session unauthenticated (app/index routes to
    // welcome), so wallets[] is the next sign-in's job, not this one's.
    expect(s.isAuthenticated).toBe(false)
    expect(usersMeMock).not.toHaveBeenCalled()
  })

})

describe('linkIdentity', () => {
  it('links a verified contact without disturbing the session, then refreshes identities', async () => {
    // Pre-authenticate the session so we can assert it stays put.
    useAuthStore.setState({ isAuthenticated: true, jwt: 'jwt-123', user: USER })
    verifyMock.mockResolvedValue({ token: 'fresh-but-discarded', user: USER, is_new: false })
    usersMeMock.mockResolvedValue({ wallets: [], profile_complete: true, user: { phone_verified_at: null } })
    methodsMock.mockResolvedValue({ identities: [{ kind: 'email', identifier: 'me@x.io', email: 'me@x.io', verified: true }] })

    await useAuthStore.getState().linkIdentity({ method: 'email', identifier: 'me@x.io', code: '424242' })

    // link: true is what attaches the bearer, the server's link discriminator.
    expect(verifyMock).toHaveBeenCalledWith(
      { method: 'email', identifier: 'me@x.io', code: '424242' },
      { link: true },
    )
    const s = useAuthStore.getState()
    // Session token is NOT replaced by the verify response (link is not a sign-in).
    expect(s.jwt).toBe('jwt-123')
    expect(s.isAuthenticated).toBe(true)
    // The freshly-linked identity is reflected.
    expect(s.identities).toEqual([{ kind: 'email', identifier: 'me@x.io', email: 'me@x.io', verified: true }])
  })

  it('propagates a verify error (e.g. IDENTITY_ALREADY_LINKED) to the caller', async () => {
    verifyMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'blocked'))
    await expect(
      useAuthStore.getState().linkIdentity({ method: 'email', identifier: 'me@x.io', code: '000000' }),
    ).rejects.toBeInstanceOf(ApiClientError)
  })
})

describe('loadMethods', () => {
  it('populates identities from GET /v1/auth/methods', async () => {
    methodsMock.mockResolvedValue({ identities: [{ kind: 'phone', identifier: '+234', email: null, verified: true }] })
    await useAuthStore.getState().loadMethods()
    expect(useAuthStore.getState().identities).toEqual([{ kind: 'phone', identifier: '+234', email: null, verified: true }])
  })

  it('swallows errors and leaves the existing list intact', async () => {
    useAuthStore.setState({ identities: [{ kind: 'email', identifier: 'a@x.io', email: 'a@x.io', verified: true }] })
    methodsMock.mockRejectedValue(new Error('offline'))
    await useAuthStore.getState().loadMethods()
    expect(useAuthStore.getState().identities).toEqual([{ kind: 'email', identifier: 'a@x.io', email: 'a@x.io', verified: true }])
  })
})

describe('refreshMe / walletsStatus lifecycle (D1)', () => {
  const linkedEvm = [{ chain_ns: 'eip155', address: '0xEvmAddr', is_primary: true, verified_at: 'now' }]

  it('sets walletsStatus ready and populates wallets on success', async () => {
    usersMeMock.mockResolvedValue({ wallets: linkedEvm, profile_complete: true })
    await useAuthStore.getState().refreshMe()
    const s = useAuthStore.getState()
    expect(s.walletsStatus).toBe('ready')
    expect(s.wallets).toHaveLength(1)
  })

  it('does NOT retry a terminal 401 and surfaces error (empty ≠ silent-empty)', async () => {
    usersMeMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'nope', 'UNAUTHORIZED'))
    await useAuthStore.getState().refreshMe()
    expect(useAuthStore.getState().walletsStatus).toBe('error')
    expect(usersMeMock).toHaveBeenCalledTimes(1) // terminal → single attempt, no retry
  })

  it('retries a transient failure and marks error only after exhausting attempts', async () => {
    jest.useFakeTimers()
    usersMeMock.mockRejectedValue(new Error('Network request failed'))
    const p = useAuthStore.getState().refreshMe()
    await jest.runAllTimersAsync() // flush the backoff sleeps instantly
    await p
    jest.useRealTimers()
    expect(usersMeMock).toHaveBeenCalledTimes(3) // default attempt budget
    expect(useAuthStore.getState().walletsStatus).toBe('error')
    expect(useAuthStore.getState().wallets).toEqual([])
  })

  it('retryWalletSync recovers from an error state', async () => {
    useAuthStore.setState({ walletsStatus: 'error' })
    usersMeMock.mockResolvedValue({ wallets: linkedEvm, profile_complete: true })
    await useAuthStore.getState().retryWalletSync()
    const s = useAuthStore.getState()
    expect(s.walletsStatus).toBe('ready')
    expect(s.wallets).toHaveLength(1)
  })

  it('a failed background refresh keeps the last-good list (no blanking to error)', async () => {
    usersMeMock.mockResolvedValueOnce({ wallets: linkedEvm, profile_complete: true })
    await useAuthStore.getState().refreshMe()
    expect(useAuthStore.getState().walletsStatus).toBe('ready')

    usersMeMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'x', 'UNAUTHORIZED'))
    await useAuthStore.getState().refreshMe()
    const s = useAuthStore.getState()
    expect(s.walletsStatus).toBe('ready') // stays ready, not error
    expect(s.wallets).toHaveLength(1) // last-good list intact
  })
})

// ─── small surfaces that were never pinned ────────────────────────────────────

describe('updateUser', () => {
  it('replaces the cached user (the profile screens write back through it)', () => {
    useAuthStore.setState({ user: null })

    useAuthStore.getState().updateUser(USER)

    expect(useAuthStore.getState().user).toEqual(USER)
  })
})

describe('useIsSeeker', () => {
  it('reads the flag off the user, and answers false when there is none', () => {
    // Fee selection (seeker_fee_bps vs fee_bps) hangs off this, so "no user"
    // must resolve to the non-seeker rate rather than undefined.
    useAuthStore.setState({ user: null })
    const { result } = renderHook(() => useIsSeeker())
    expect(result.current).toBe(false)

    act(() => useAuthStore.setState({ user: { ...USER, is_seeker: true } }))
    expect(result.current).toBe(true)

    act(() => useAuthStore.setState({ user: { ...USER, is_seeker: false } }))
    expect(result.current).toBe(false)
  })
})
