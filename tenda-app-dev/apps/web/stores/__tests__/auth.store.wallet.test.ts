/**
 * auth.store — the wallet paths: adapter sign-in, linking a wallet to an
 * existing account, refreshing the linked set, and what logout does to a
 * wallet session. Identity and session live in auth.store.test.ts.
 */
import { vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: {
    auth: { verify: vi.fn(), me: vi.fn(), methods: vi.fn() },
    users: { updateMe: vi.fn(), me: vi.fn() },
  },
}))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { disconnect: vi.fn(async () => {}) } }))

import { ApiClientError } from '@tenda/shared'
import { api } from '@/api/client'
import { signInWithWallet as walletSignIn, linkWalletWith } from '@/wallet/auth'
import { reownAdapter } from '@/wallet/adapters/reown'
import { useAuthStore } from '@/stores/auth.store'
import { JWT_TOKEN_KEY } from '@/lib/storage'
import { makeMeResponse, makeUser } from '../../test/factories/user'

const usersApi = vi.mocked(api.users)
const walletSignInMock = vi.mocked(walletSignIn)
const linkWalletWithMock = vi.mocked(linkWalletWith)
const adapterDisconnect = vi.mocked(reownAdapter.disconnect)

function resetStore() {
  window.localStorage.clear()
  useAuthStore.setState({
    user: null,
    jwt: null,
    isAuthenticated: false,
    isLoading: true,
    profileComplete: null,
    identities: [],
    wallets: [],
    walletsStatus: 'idle',
  })
}

beforeEach(resetStore)

const WALLET_ACCOUNT = {
  namespace: 'solana' as const,
  chainId: 'solana:devnet',
  address: 'SoLAddr',
  walletId: 'reown',
}
const LINKED = [{ chain_ns: 'solana' as const, address: 'SoLAddr', is_primary: true, verified_at: 'now' }]

/** The store only forwards the adapter to wallet/auth — a full inert stub. */
const ADAPTER: import('@/wallet/adapters/types').WalletAdapter = {
  id: 'reown',
  name: 'Wallet',
  namespaces: ['solana', 'eip155'],
  isAvailable: async () => true,
  connect: async () => WALLET_ACCOUNT,
  signMessage: async (_a, message) => ({ signature: 's', message }),
  authenticate: async () => null,
  disconnect: async () => {},
  getRestoredAccount: async () => null,
}

const meResponse = makeMeResponse

describe('signInWithWallet (adapter path)', () => {
  it('sets the session from the wallet auth and loads wallets[] in the background', async () => {
    const user = makeUser({ first_name: 'Ada', last_name: 'Okafor' })
    walletSignInMock.mockResolvedValue({ auth: { token: 'jwt-w', user, is_new: false }, account: WALLET_ACCOUNT })
    usersApi.me.mockResolvedValue(meResponse(LINKED))

    await expect(useAuthStore.getState().signInWithWallet(ADAPTER)).resolves.toBe(true)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.jwt).toBe('jwt-w')
    expect(state.profileComplete).toBe(true)
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBe('jwt-w')
    expect(walletSignInMock).toHaveBeenCalledWith(ADAPTER)
    // Background wallets[] load settles into the store.
    await vi.waitFor(() => expect(useAuthStore.getState().wallets).toEqual(LINKED))
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
  })

  it('returns false on a wallet decline and stays signed out', async () => {
    walletSignInMock.mockResolvedValue(null)
    await expect(useAuthStore.getState().signInWithWallet(ADAPTER)).resolves.toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(usersApi.me).not.toHaveBeenCalled()
  })

  it('purges a stale stored bearer when the wallet verify 401s UNAUTHORIZED', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'stale-jwt')
    walletSignInMock.mockRejectedValue(
      new ApiClientError(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED'),
    )
    await expect(useAuthStore.getState().signInWithWallet(ADAPTER)).rejects.toBeInstanceOf(ApiClientError)
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
  })

  it('propagates WALLET_NOT_LINKED to the caller (the page renders it first-class)', async () => {
    walletSignInMock.mockRejectedValue(
      new ApiClientError(404, 'Not Found', 'wallet not linked', 'WALLET_NOT_LINKED'),
    )
    await expect(useAuthStore.getState().signInWithWallet(ADAPTER)).rejects.toMatchObject({
      code: 'WALLET_NOT_LINKED',
    })
    // NOT a stale-bearer purge — nothing to clear, and a stored token survives.
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('linkWallet', () => {
  it('links (forceFresh handled by wallet/auth) and refreshes wallets[]', async () => {
    linkWalletWithMock.mockResolvedValue(WALLET_ACCOUNT)
    usersApi.me.mockResolvedValue(meResponse(LINKED))
    await expect(useAuthStore.getState().linkWallet(ADAPTER)).resolves.toBe(true)
    expect(useAuthStore.getState().wallets).toEqual(LINKED)
  })

  it('returns false on decline without a wallets refresh', async () => {
    linkWalletWithMock.mockResolvedValue(null)
    await expect(useAuthStore.getState().linkWallet(ADAPTER)).resolves.toBe(false)
    expect(usersApi.me).not.toHaveBeenCalled()
  })
})

describe('refreshWallets', () => {
  it('loads the linked list and marks ready', async () => {
    usersApi.me.mockResolvedValue(meResponse(LINKED))
    await useAuthStore.getState().refreshWallets()
    expect(useAuthStore.getState().wallets).toEqual(LINKED)
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
  })

  it('keeps the last-good list on failure and marks error (never blanks a rendered list)', async () => {
    useAuthStore.setState({ wallets: LINKED, walletsStatus: 'ready' })
    usersApi.me.mockRejectedValue(new Error('down'))
    await useAuthStore.getState().refreshWallets()
    expect(useAuthStore.getState().wallets).toEqual(LINKED)
    expect(useAuthStore.getState().walletsStatus).toBe('error')
  })
})

describe('ensureWallets', () => {
  it('JOINS an in-flight load instead of returning with nothing ensured', async () => {
    // The session bootstrap fires refreshWallets on every sign-in/restore; a
    // tx guard calling ensureWallets inside that window must come back with
    // the list settled — an early return on `loading` hard-failed the first
    // click of every session ("Could not load your linked wallets").
    let release: (value: import('@tenda/shared').MeResponse) => void = () => {}
    usersApi.me.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const bootstrapLoad = useAuthStore.getState().refreshWallets()
    expect(useAuthStore.getState().walletsStatus).toBe('loading')

    const ensured = useAuthStore.getState().ensureWallets()
    release(meResponse(LINKED))
    await ensured
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
    expect(useAuthStore.getState().wallets).toEqual(LINKED)
    expect(usersApi.me).toHaveBeenCalledTimes(1) // joined, not re-fetched
    await bootstrapLoad
  })

  it('is a no-op once ready, and retries after an error', async () => {
    useAuthStore.setState({ wallets: LINKED, walletsStatus: 'ready' })
    await useAuthStore.getState().ensureWallets()
    expect(usersApi.me).not.toHaveBeenCalled()

    useAuthStore.setState({ walletsStatus: 'error' })
    usersApi.me.mockResolvedValue(meResponse(LINKED))
    await useAuthStore.getState().ensureWallets()
    expect(usersApi.me).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
  })
})

describe('logout (wallet session)', () => {
  it('drops the wallet session so the next sign-in shows the picker', async () => {
    await useAuthStore.getState().logout()
    expect(adapterDisconnect).toHaveBeenCalledTimes(1)
  })

  it('a failed wallet disconnect never blocks logout', async () => {
    adapterDisconnect.mockRejectedValueOnce(new Error('relay gone'))
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-1')
    await useAuthStore.getState().logout()
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

