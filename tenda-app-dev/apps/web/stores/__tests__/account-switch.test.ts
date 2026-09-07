/**
 * What survives an account switch (#25).
 *
 * Signing out is a soft navigation, so nothing in this tab is torn down — every
 * store is a module singleton that carries straight into the next session. The
 * three stores below were each added by a later task and none was ever wired
 * into the clearing, which is why they are asserted per store rather than in
 * one sweep: a single "everything is empty" assertion passes just as happily
 * when a store is empty because nobody ever filled it.
 *
 * The cross-tab half matters as much as `logout`, and had even less: that path
 * never calls `logout` at all, so it missed the clearing #16 added too.
 */
import { vi } from 'vitest'

const { gigGetMock } = vi.hoisted(() => ({ gigGetMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  api: {
    auth: { verify: vi.fn(), me: vi.fn(), methods: vi.fn() },
    users: { updateMe: vi.fn(), me: vi.fn() },
    gigs: { get: (...args: unknown[]) => gigGetMock(...args) },
  },
}))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { disconnect: vi.fn(async () => {}) } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { initCrossTabAuthSync } from '@/stores/auth/cross-tab'
import { accountGeneration } from '@/lib/account-state'
import { makeUser } from '../../test/factories/user'
import { useGigsStore } from '@/stores/gigs.store'
import { useEscrowStore } from '@/stores/escrow.store'
import { useSigninFlowStore } from '@/stores/signin-flow.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import { JWT_TOKEN_KEY } from '@/lib/storage'

/**
 * The previous account's PRIVATE view of a gig. `counterparty` and `proofs`
 * are the fields the server serves only to PARTIES (lib/escrow-detail-scope).
 *
 * Asserted at the STORE and not through a rendered page on purpose: the
 * components that draw this half key off the current viewer's id and show
 * nothing to a non-party, so a page-level test would pass whether or not the
 * store had been emptied — it would be measuring the consumers' guard, not
 * this one. What is provable here is the thing that is actually wrong: the
 * data is still held.
 */
const HELD_GIG = {
  escrow_id: 'gig-held',
  title: 'Deliver a parcel across Yaba',
  counterparty: { id: 'user-counterparty', first_name: 'Ada', last_name: 'Okafor' },
  proofs: [{ id: 'proof-1', url: 'https://res.cloudinary.com/x/receipt.jpg' }],
}

/**
 * Fill every account-scoped store, through the same calls the app uses — a
 * `setState` would prove the reset clears a field, not that a real session
 * puts it there.
 */
async function fillStores(): Promise<void> {
  gigGetMock.mockResolvedValue(HELD_GIG)
  await useGigsStore.getState().fetchGigDetail(HELD_GIG.escrow_id)
  useEscrowStore.setState({ error: 'Only the escrow creator can attach gig details' })
  useSigninFlowStore.getState().begin('email', 'previous-account@tenda.test', 600)
}

beforeEach(() => {
  useGigsStore.getState().reset()
  useEscrowStore.getState().reset()
  useSigninFlowStore.getState().clear()
  gigGetMock.mockReset()
})

describe('logout', () => {
  it('drops the held gig DETAIL, which carries the party-scoped half', async () => {
    await fillStores()
    expect(useGigsStore.getState().selectedGig?.counterparty).toBeDefined()

    await useAuthStore.getState().logout()

    expect(useGigsStore.getState().selectedGig).toBeNull()
  })

  it('a fetch already IN FLIGHT cannot repopulate the store after the clear', async () => {
    // The clear is a moment, not a state: a detail request that was already on
    // its way resolves afterwards, and `fetchGigDetail` only discards a
    // response whose token has been superseded. Signing out is not a new
    // fetch, so nothing superseded it — the previous account's gig lands back
    // in the store milliseconds after being dropped.
    let resolve!: (gig: unknown) => void
    gigGetMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const inFlight = useGigsStore.getState().fetchGigDetail(HELD_GIG.escrow_id)

    await useAuthStore.getState().logout()
    resolve(HELD_GIG)
    await inFlight

    expect(useGigsStore.getState().selectedGig).toBeNull()
  })

  it('drops a gig load ERROR, which names the gig it failed on', async () => {
    useGigsStore.setState({ error: { id: 'gig-held', gone: true, message: 'not available' } })

    await useAuthStore.getState().logout()

    expect(useGigsStore.getState().error).toBeNull()
  })

  it("drops the escrow store's last server message and its in-flight flag", async () => {
    await fillStores()
    useEscrowStore.setState({ isBusy: true })

    await useAuthStore.getState().logout()

    expect(useEscrowStore.getState().error).toBeNull()
    expect(useEscrowStore.getState().isBusy).toBe(false)
  })

  it('drops a pending sign-in challenge, which holds an email address', async () => {
    await fillStores()
    expect(useSigninFlowStore.getState().pending?.identifier).toBe('previous-account@tenda.test')

    await useAuthStore.getState().logout()

    expect(useSigninFlowStore.getState().pending).toBeNull()
  })

  it('KEEPS the public server facts — they are identical for every reader', async () => {
    // Clearing these would refetch on the next sign-in for nothing, and blank a
    // rendered balance while the chain registry reloaded. Asserted so a later
    // "empty everything" sweep cannot quietly take them along.
    useChainRegistryStore.setState({ status: 'ready' })
    usePlatformConfigStore.setState({ loading: false })

    await useAuthStore.getState().logout()

    expect(useChainRegistryStore.getState().status).toBe('ready')
    expect(usePlatformConfigStore.getState().loading).toBe(false)
  })
})

describe('cross-tab account switch', () => {
  it('empties the stores when another tab signs OUT', async () => {
    const stop = initCrossTabAuthSync()
    await fillStores()

    window.dispatchEvent(new StorageEvent('storage', { key: JWT_TOKEN_KEY, newValue: null }))

    expect(useGigsStore.getState().selectedGig).toBeNull()
    expect(useEscrowStore.getState().error).toBeNull()
    expect(useSigninFlowStore.getState().pending).toBeNull()
    stop()
  })

  it('empties them when another tab signs in as SOMEBODY ELSE', async () => {
    // The worse edge: this tab ADOPTS the new token and carries on rendering
    // without ever passing through logout, so the previous account's gig is
    // still the one held while the new session runs.
    const stop = initCrossTabAuthSync()
    await fillStores()

    window.dispatchEvent(
      new StorageEvent('storage', { key: JWT_TOKEN_KEY, newValue: 'jwt-of-another-account' }),
    )

    expect(useGigsStore.getState().selectedGig).toBeNull()
    stop()
  })

  it('ignores a storage event for an unrelated key', async () => {
    const stop = initCrossTabAuthSync()
    await fillStores()

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }))

    // Nothing about the session changed, so nothing may be dropped — otherwise
    // any unrelated write in another tab blanks this one's screen.
    expect(useGigsStore.getState().selectedGig).not.toBeNull()
    stop()
  })
})

describe('sign-in', () => {
  it('moves the generation WITHOUT emptying the sign-in flow that is mid-use', async () => {
    // The one transition that must BUMP and must not CLEAR, and the only one
    // whose must-not-clear half had no unit test — it was held by an e2e
    // (focused-shell, "the card stays on screen until the next step replaces
    // it") because the damage is visual. `logout` already emptied everything;
    // what is on screen at this exact moment is the verify card, and it renders
    // from `pending`, so clearing here blanks the reader's own sign-in card one
    // step before the next page paints. That is #14's regression, brought
    // straight back once by calling clearAccountState here (#45).
    //
    // The bump is not optional either: the signed-out window is not inert — the
    // conversation poll runs while the socket is down — so a request issued in
    // it must not land in the session that follows.
    useSigninFlowStore.getState().begin('email', 'new-account@tenda.test', 600)
    const before = accountGeneration()
    vi.mocked(api.auth.verify).mockResolvedValue({
      token: 'jwt-of-the-new-account',
      user: makeUser({ id: 'user-new' }),
      is_new: false,
    })

    await useAuthStore.getState().signInWithVerify({
      method: 'email',
      identifier: 'new-account@tenda.test',
      code: '123456',
    })

    expect(accountGeneration()).toBe(before + 1)
    expect(useSigninFlowStore.getState().pending?.identifier).toBe('new-account@tenda.test')
  })
})
