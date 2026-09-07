/**
 * A response already in flight when the account changed (#45).
 *
 * `reset()` empties a store at one MOMENT. A request on its way is not stopped
 * by it and writes whatever it was fetching when it lands, so the previous
 * account's rows returned milliseconds after being dropped — the reset was
 * real, and then it was undone. Split from account-switch.test.ts because
 * every case here needs a deferred promise and a resolve after the clear,
 * which reads as a different kind of test.
 *
 * One case per WRITER, not one per store: the guard is applied at each write
 * point, so a store with three of them can be fixed in one and leak in another.
 */
import { vi } from 'vitest'

const { convList, convFindOrCreate, convMessages, notifFeed, notifUnread, escrowAccept } =
  vi.hoisted(() => ({
    convList: vi.fn(),
    convFindOrCreate: vi.fn(),
    convMessages: vi.fn(),
    notifFeed: vi.fn(),
    notifUnread: vi.fn(),
    escrowAccept: vi.fn(),
  }))

vi.mock('@/api/client', () => ({
  api: {
    auth: { verify: vi.fn(), me: vi.fn(), methods: vi.fn() },
    users: { updateMe: vi.fn(), me: vi.fn() },
    conversations: {
      list: (...a: unknown[]) => convList(...a),
      findOrCreate: (...a: unknown[]) => convFindOrCreate(...a),
      messages: (...a: unknown[]) => convMessages(...a),
    },
    notifications: { feed: (...a: unknown[]) => notifFeed(...a), unreadCount: (...a: unknown[]) => notifUnread(...a) },
    escrows: { accept: (...a: unknown[]) => escrowAccept(...a) },
  },
}))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { disconnect: vi.fn(async () => {}) } }))

import { api } from '@/api/client'
import { reownAdapter } from '@/wallet/adapters/reown'
import { useAuthStore } from '@/stores/auth.store'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useEscrowStore } from '@/stores/escrow.store'
import { JWT_TOKEN_KEY } from '@/lib/storage'
import { makeUser } from '../../test/factories/user'
import { deferred } from '../../test/deferred'

const authApi = vi.mocked(api.auth)

beforeEach(() => {
  useChatStore.getState().reset()
  useNotificationsStore.getState().reset()
  useEscrowStore.getState().reset()
  vi.clearAllMocks()
})

describe('chat', () => {
  it('a conversations load in flight cannot restore the inbox or its badge', async () => {
    const gate = deferred<unknown>()
    convList.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().fetchConversations()

    await useAuthStore.getState().logout()
    gate.resolve([{ id: 'conv-1', unread_count: 3 }])
    await inFlight

    expect(useChatStore.getState().conversations).toEqual([])
    expect(useChatStore.getState().unread).toBe(0)
  })

  it('a conversations load that FAILS cannot put an error on the next account', async () => {
    const gate = deferred<unknown>()
    convList.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().fetchConversations().catch(() => {})

    await useAuthStore.getState().logout()
    gate.reject(new Error('the abandoned session died'))
    await inFlight

    // 'idle' is what reset leaves; 'error' would be the dead session's failure
    // rendered as the new reader's broken inbox.
    expect(useChatStore.getState().conversationsStatus).toBe('idle')
  })

  it('a failure in the SAME session is still recorded — the guard is not a mute', async () => {
    // The other half of the guard above. Dropping a dead session's error must
    // not cost a live one its error state, or the inbox would fail silently.
    convList.mockRejectedValue(new Error('index down'))

    await expect(useChatStore.getState().fetchConversations()).rejects.toThrow('index down')

    expect(useChatStore.getState().conversationsStatus).toBe('error')
  })

  it('a findOrCreate in flight cannot add its conversation back', async () => {
    const gate = deferred<unknown>()
    convFindOrCreate.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().findOrCreate('user-9')

    await useAuthStore.getState().logout()
    gate.resolve({ id: 'conv-new', unread_count: 0 })
    await inFlight

    expect(useChatStore.getState().conversations).toEqual([])
  })

  it('a messages load in flight cannot add a thread back', async () => {
    const gate = deferred<unknown>()
    convMessages.mockReturnValue(gate.promise)
    const inFlight = useChatStore.getState().fetchMessages('conv-1')

    await useAuthStore.getState().logout()
    gate.resolve([{ id: 'm1', conversation_id: 'conv-1', sender_id: 'u1', content: 'private' }])
    await inFlight

    expect(useChatStore.getState().messages).toEqual({})
  })
})

describe('notifications', () => {
  it('a feed load in flight cannot restore the notices', async () => {
    const gate = deferred<unknown>()
    notifFeed.mockReturnValue(gate.promise)
    const inFlight = useNotificationsStore.getState().fetchFeed()

    await useAuthStore.getState().logout()
    gate.resolve({ notifications: [{ id: 'n1', title: 'Paid', body: 'x' }], announcements: [], unread_count: 4 })
    await inFlight

    expect(useNotificationsStore.getState().notifications).toEqual([])
    expect(useNotificationsStore.getState().unread).toBe(0)
  })

  it('an unread-count refresh in flight cannot restore the BELL badge', async () => {
    // The most visible of them: the previous account's unread total sitting on
    // the next account's chrome.
    const gate = deferred<unknown>()
    notifUnread.mockReturnValue(gate.promise)
    const inFlight = useNotificationsStore.getState().refreshUnread()

    await useAuthStore.getState().logout()
    gate.resolve({ count: 7 })
    await inFlight

    expect(useNotificationsStore.getState().unread).toBe(0)
  })
})

describe('escrow', () => {
  it('a transition that FAILS in flight cannot leave its server message behind', async () => {
    const gate = deferred<unknown>()
    escrowAccept.mockReturnValue(gate.promise)
    const inFlight = useEscrowStore.getState().requestAccept('escrow-1').catch(() => {})

    await useAuthStore.getState().logout()
    gate.reject(new Error('Only the escrow creator can attach gig details'))
    await inFlight

    expect(useEscrowStore.getState().error).toBeNull()
    expect(useEscrowStore.getState().isBusy).toBe(false)
  })
})

describe('a request issued while SIGNED OUT', () => {
  it('cannot write into the session that signs in after it', async () => {
    // The generation only moves when state is cleared. A fetch started during
    // the signed-out window captures the post-logout number, and signing in
    // does not move it — so without treating sign-in as an account change too,
    // that response lands in the NEXT account's store. Not hypothetical:
    // logout flips conversation polling on (socket down => enabled), which
    // fires exactly such a request.
    await useAuthStore.getState().logout()

    const gate = deferred<unknown>()
    convList.mockReturnValue(gate.promise)
    const strayed = useChatStore.getState().fetchConversations().catch(() => {})

    authApi.verify.mockResolvedValue({
      token: 'jwt-b',
      user: makeUser({ id: 'user-b', first_name: 'Bola', last_name: 'Ade' }),
      is_new: false,
    })
    await useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'b@tenda.test', code: '1' })

    gate.resolve([{ id: 'conv-of-nobody', unread_count: 2 }])
    await strayed

    expect(useChatStore.getState().conversations).toEqual([])
    expect(useChatStore.getState().unread).toBe(0)
  })
})

/**
 * The store that OWNS the transition has in-flight writers too, and being the
 * owner is not a guard: `logout` empties it at one moment, and a `users.me` or
 * `auth.me` already on its way still lands afterwards. Three writers, three
 * cases — the rule this file states at the top.
 */
describe('auth', () => {
  it('a linked-wallets refresh in flight cannot hand the next account the previous one\'s wallets', async () => {
    // The worst of the three: useWalletScreen reads `wallets` to decide the
    // section AND passes it to readWalletBalances, so the next reader would be
    // shown the previous account's addresses with their real on-chain balances.
    const gate = deferred<unknown>()
    vi.mocked(api.users.me).mockReturnValue(gate.promise as Promise<never>)
    const inFlight = useAuthStore.getState().refreshWallets()

    await useAuthStore.getState().logout()
    gate.resolve({ wallets: [{ id: 'w1', address: 'SoLAddrA', chain_ns: 'solana' }] })
    await inFlight

    expect(useAuthStore.getState().wallets).toEqual([])
    expect(useAuthStore.getState().walletsStatus).toBe('idle')
  })

  it('a user refresh in flight cannot put the previous account back on screen', async () => {
    const gate = deferred<unknown>()
    authApi.me.mockReturnValue(gate.promise as Promise<never>)
    const inFlight = useAuthStore.getState().refreshUser()

    await useAuthStore.getState().logout()
    gate.resolve(makeUser({ id: 'user-a', first_name: 'Ada', last_name: 'Prev' }))
    await inFlight

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('a methods load in flight cannot list the previous account\'s sign-in methods', async () => {
    const gate = deferred<unknown>()
    authApi.methods.mockReturnValue(gate.promise as Promise<never>)
    const inFlight = useAuthStore.getState().loadMethods()

    await useAuthStore.getState().logout()
    gate.resolve({ identities: [{ method: 'email', identifier: 'ada@tenda.test' }] })
    await inFlight

    expect(useAuthStore.getState().identities).toEqual([])
  })

  it('a bootstrap in flight cannot sign the tab back in after a sign-out', async () => {
    window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-a')
    const gate = deferred<unknown>()
    authApi.me.mockReturnValue(gate.promise as Promise<never>)
    const inFlight = useAuthStore.getState().loadSession()

    await useAuthStore.getState().logout()
    gate.resolve(makeUser({ id: 'user-a', first_name: 'Ada', last_name: 'Prev' }))
    await inFlight

    // Signed out means signed out: the credential was cleared, so a late
    // bootstrap must not re-assert the session it was fetched for.
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    // And the render/redirect gate is not stranded by the dropped write —
    // `logout` settled it, which is the argument the guard rests on.
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})

describe('the sign-out itself', () => {
  it('a slow wallet disconnect cannot wipe the session that signed in behind it', async () => {
    // `logout` bumps the generation FIRST and then awaits — clearAuthStorage,
    // and a WalletConnect disconnect that is a relay round-trip. Its own final
    // set({...SIGNED_OUT}) therefore lands after those awaits, and a sign-in
    // completed in that window is what it would overwrite.
    const gate = deferred<void>()
    vi.mocked(reownAdapter.disconnect).mockReturnValue(gate.promise)
    const signingOut = useAuthStore.getState().logout()

    authApi.verify.mockResolvedValue({
      token: 'jwt-b',
      user: makeUser({ id: 'user-b', first_name: 'Bola', last_name: 'Ade' }),
      is_new: false,
    })
    await useAuthStore.getState().signInWithVerify({ method: 'email', identifier: 'b@tenda.test', code: '1' })

    gate.resolve()
    await signingOut

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.id).toBe('user-b')
  })
})
