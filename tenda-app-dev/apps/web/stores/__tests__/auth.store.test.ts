/**
 * auth.store — identity and session: verify sign-in, session load, logout and
 * the caches it must clear, linked identities, and cross-tab sync. The wallet
 * sign-in and linking paths, and their fixtures, live in
 * auth.store.wallet.test.ts.
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
import { useAuthStore } from '@/stores/auth.store'
import { initCrossTabAuthSync } from '@/stores/auth/cross-tab'
import { useNotificationsStore } from '@/stores/notifications.store'
import { JWT_TOKEN_KEY } from '@/lib/storage'
import { makeMeResponse, makeUser } from '../../test/factories/user'
import { rememberPage, readPage } from '@tenda/shared'
import { useChatStore } from '@/stores/chat.store'
import { disputesPageCache } from '@/lib/account-state'
import { makeConversation } from '../../test/factories/chat'

const authApi = vi.mocked(api.auth)

function resetStore() {
  window.localStorage.clear()
  useAuthStore.setState({
    user: null,
    jwt: null,
    isAuthenticated: false,
    isLoading: true,
    profileComplete: null,
    identities: [],
    identitiesStatus: 'idle',
    wallets: [],
    walletsStatus: 'idle',
  })
}

beforeEach(resetStore)

describe('signInWithVerify', () => {
  it('stores the token, hydrates the user, and derives profileComplete', async () => {
    const user = makeUser({ first_name: 'Ada', last_name: 'Okafor' })
    authApi.verify.mockResolvedValue({ token: 'jwt-1', user, is_new: false })

    const result = await useAuthStore.getState().signInWithVerify({
      method: 'email',
      identifier: 'ada@x.io',
      code: '123456',
    })

    expect(result).toEqual({ isNew: false })
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBe('jwt-1')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.profileComplete).toBe(true)
  })

  it('fires the background wallets[] load — every tx path reads the trust registry', async () => {
    authApi.verify.mockResolvedValue({ token: 'jwt-1', user: makeUser(), is_new: false })
    const wallets = [{ chain_ns: 'solana' as const, address: 'SoLAddr', is_primary: true, verified_at: 'now' }]
    vi.mocked(api.users.me).mockResolvedValue(makeMeResponse(wallets))

    await useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'a@x.io', code: '123456' })

    await vi.waitFor(() => expect(useAuthStore.getState().wallets).toEqual(wallets))
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
  })

  it('a fresh account with empty names is profile-incomplete', async () => {
    authApi.verify.mockResolvedValue({
      token: 'jwt-new',
      user: makeUser({ first_name: '', last_name: '' }),
      is_new: true,
    })
    const result = await useAuthStore.getState().signInWithVerify({
      method: 'email',
      identifier: 'new@x.io',
      code: '123456',
    })
    expect(result.isNew).toBe(true)
    expect(useAuthStore.getState().profileComplete).toBe(false)
  })

  it("purges a stale bearer when the JWT guard 401s, so the next attempt starts clean", async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'stale-jwt')
    authApi.verify.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED'))

    await expect(
      useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'a@x.io', code: '000000' }),
    ).rejects.toBeInstanceOf(ApiClientError)

    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does NOT purge on an ordinary verify failure (wrong code)', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'still-valid')
    authApi.verify.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'Invalid or expired code', 'OTP_INVALID'))

    await expect(
      useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'a@x.io', code: '999999' }),
    ).rejects.toBeInstanceOf(ApiClientError)

    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBe('still-valid')
  })
})

describe('loadSession', () => {
  it('no stored token → signed out, done loading, no network call', async () => {
    await useAuthStore.getState().loadSession()
    const state = useAuthStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.isAuthenticated).toBe(false)
    expect(authApi.me).not.toHaveBeenCalled()
  })

  it('valid token → hydrates from me() with profileComplete', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-ok')
    authApi.me.mockResolvedValue(makeUser())
    await useAuthStore.getState().loadSession()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.jwt).toBe('jwt-ok')
    expect(state.profileComplete).toBe(true)
  })

  it('a restored session loads wallets[] in the background (mobile loadSession → refreshMe parity)', async () => {
    // Without this a fresh tab reached every tx path with an empty trust
    // registry: signer sets blanked, the balance gate fell open, and
    // ensureSessionOn refused the user's own linked wallet as a stranger.
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-ok')
    authApi.me.mockResolvedValue(makeUser())
    const wallets = [{ chain_ns: 'eip155' as const, address: '0xW', is_primary: true, verified_at: 'now' }]
    vi.mocked(api.users.me).mockResolvedValue(makeMeResponse(wallets))

    await useAuthStore.getState().loadSession()

    await vi.waitFor(() => expect(useAuthStore.getState().wallets).toEqual(wallets))
    expect(useAuthStore.getState().walletsStatus).toBe('ready')
  })

  it('401 → clears storage and signs out', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'dead-jwt')
    authApi.me.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'invalid', 'UNAUTHORIZED'))
    await useAuthStore.getState().loadSession()
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('transient failure → KEEPS the stored credential but routes signed out', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-keep')
    authApi.me.mockRejectedValue(new TypeError('Network request failed'))
    await useAuthStore.getState().loadSession()
    const state = useAuthStore.getState()
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBe('jwt-keep')
    expect(state.jwt).toBe('jwt-keep')
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
  })
})

describe('logout', () => {
  it('clears state and storage so no stale bearer reaches the next challenge', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-1')
    useAuthStore.setState({ user: makeUser(), jwt: 'jwt-1', isAuthenticated: true, isLoading: false })
    await useAuthStore.getState().logout()
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('drops the INBOX and the list caches for the same reason', async () => {
    // Sign-out is a soft navigation, so the JS context survives an account
    // switch made in the same tab — every store and every module-scoped cache
    // with it. Measured before this: the next account's inbox column listed
    // the previous account's threads.
    useChatStore.setState({
      conversations: [makeConversation({ id: 'c1' })],
      conversationsStatus: 'ready',
      unread: 4,
      messages: { c1: [] },
    })
    rememberPage(disputesPageCache, 'status=open', { items: [], total: 3 })

    await useAuthStore.getState().logout()

    const chat = useChatStore.getState()
    expect(chat.conversations).toEqual([])
    expect(chat.unread).toBe(0)
    expect(chat.messages).toEqual({})
    // Back to 'idle', not 'ready': the next account has not loaded anything,
    // and 'ready' with no rows is the empty state — a claim about THEIR inbox.
    expect(chat.conversationsStatus).toBe('idle')
    expect(readPage(disputesPageCache, 'status=open')).toBeUndefined()
  })

  it('drops notification state so the next account never sees these notices', async () => {
    useNotificationsStore.setState({
      unread: 3,
      notifications: [
        { id: 'n1', title: 'T', body: 'B', data: null, read_at: null, created_at: '2026-08-15T12:00:00.000Z' },
      ],
    })
    await useAuthStore.getState().logout()
    expect(useNotificationsStore.getState().unread).toBe(0)
    expect(useNotificationsStore.getState().notifications).toEqual([])
  })
})

describe('linkIdentity + loadMethods', () => {
  it('links with link:true and refreshes the methods list', async () => {
    authApi.verify.mockResolvedValue({ token: 'discarded', user: makeUser(), is_new: false })
    authApi.methods.mockResolvedValue({
      identities: [{ kind: 'email', identifier: 'ada@x.io', email: 'ada@x.io', verified: true }],
    })
    authApi.me.mockResolvedValue(makeUser())

    await useAuthStore.getState().linkIdentity({ method: 'email', identifier: 'ada@x.io', code: '123456' })

    expect(authApi.verify).toHaveBeenCalledWith(
      { method: 'email', identifier: 'ada@x.io', code: '123456' },
      { link: true },
    )
    expect(useAuthStore.getState().identities).toHaveLength(1)
  })

  it('a methods failure is non-fatal', async () => {
    authApi.methods.mockRejectedValue(new Error('down'))
    await expect(useAuthStore.getState().loadMethods()).resolves.toBeUndefined()
  })
})

describe('cross-tab sync', () => {
  it('token removed in another tab → this tab signs out', () => {
    useAuthStore.setState({ user: makeUser(), jwt: 'jwt-1', isAuthenticated: true, isLoading: false })
    const cleanup = initCrossTabAuthSync()
    window.dispatchEvent(new StorageEvent('storage', { key: JWT_TOKEN_KEY, newValue: null }))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    cleanup()
  })

  it('token appeared in another tab → this tab re-runs the bootstrap', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-2')
    authApi.me.mockResolvedValue(makeUser())
    const cleanup = initCrossTabAuthSync()
    window.dispatchEvent(new StorageEvent('storage', { key: JWT_TOKEN_KEY, newValue: 'jwt-2' }))
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    cleanup()
  })

  it('ignores unrelated storage keys', () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false })
    const cleanup = initCrossTabAuthSync()
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    cleanup()
  })

  it('cleanup detaches the listener', () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false })
    const cleanup = initCrossTabAuthSync()
    cleanup()
    window.dispatchEvent(new StorageEvent('storage', { key: JWT_TOKEN_KEY, newValue: null }))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})

describe('refreshUser', () => {
  it('a failed refresh keeps the user on screen and does not throw', async () => {
    // The arm the coverage walk found never exercised (#45 re-audit). It is a
    // deliberate swallow — a focus refresh that cannot reach the server must
    // not blank the profile or reject into a fire-and-forget caller — so the
    // contract is "nothing changes", and that needs stating as a test rather
    // than as an empty catch block nobody has run.
    const user = makeUser({ id: 'user-a', first_name: 'Ada', last_name: 'Lovelace' })
    useAuthStore.setState({ user, isAuthenticated: true, isLoading: false })
    authApi.me.mockRejectedValue(new Error('network down'))

    await expect(useAuthStore.getState().refreshUser()).resolves.toBeUndefined()

    expect(useAuthStore.getState().user).toEqual(user)
  })
})

// ---------- Stage 3: the wallet half ----------------------------------------

