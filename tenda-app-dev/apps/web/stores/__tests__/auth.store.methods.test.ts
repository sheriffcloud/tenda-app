/**
 * auth.store — the sign-in METHODS read's lifecycle (`identitiesStatus`).
 *
 * `identities` starts empty for every account, so a surface that keyed a
 * claim on the LIST alone said "add a sign-in method" to everyone until the
 * read answered, and kept saying it when the read failed. The status is what
 * lets a reader tell "none" from "not asked yet" — the same four states the
 * wallets[] load reports itself with.
 */
import { vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: { auth: { methods: vi.fn(), me: vi.fn() }, users: { me: vi.fn() } },
}))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { disconnect: vi.fn(async () => {}) } }))

import type { IdentityMethodWire } from '@tenda/shared'
import { api } from '@/api/client'
import { clearAccountState } from '@/lib/account-state'
import { SIGNED_OUT, useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../test/factories/user'

type MethodsAnswer = { identities: IdentityMethodWire[] }

const EMAIL: IdentityMethodWire = { kind: 'email', identifier: 'ada@x.io', email: 'ada@x.io', verified: true }

/** A methods read held open until the test settles it. */
function heldMethodsRead() {
  let settle: (answer: MethodsAnswer) => void = () => {}
  let fail: (error: Error) => void = () => {}
  vi.mocked(api.auth.methods).mockReturnValue(
    new Promise<MethodsAnswer>((resolve, reject) => {
      settle = resolve
      fail = reject
    }),
  )
  return { settle: (answer: MethodsAnswer) => settle(answer), fail: (error: Error) => fail(error) }
}

beforeEach(() => {
  window.localStorage.clear()
  useAuthStore.setState({ ...SIGNED_OUT, user: makeUser(), isAuthenticated: true, isLoading: false })
})

describe('loadMethods', () => {
  it('starts idle — nothing has asked — and is loading while the read is out', () => {
    expect(useAuthStore.getState().identitiesStatus).toBe('idle')
    heldMethodsRead()
    void useAuthStore.getState().loadMethods()
    expect(useAuthStore.getState().identitiesStatus).toBe('loading')
  })

  it('is ready with the identities once the read answers — an EMPTY answer included', async () => {
    const read = heldMethodsRead()
    const pending = useAuthStore.getState().loadMethods()
    read.settle({ identities: [EMAIL] })
    await pending
    expect(useAuthStore.getState()).toMatchObject({ identities: [EMAIL], identitiesStatus: 'ready' })

    vi.mocked(api.auth.methods).mockResolvedValue({ identities: [] })
    await useAuthStore.getState().loadMethods()
    // Ready with none is the honest "no methods" — distinct from idle.
    expect(useAuthStore.getState()).toMatchObject({ identities: [], identitiesStatus: 'ready' })
  })

  it('is error after a failed read, and keeps the last list rather than blanking it', async () => {
    useAuthStore.setState({ identities: [EMAIL], identitiesStatus: 'ready' })
    vi.mocked(api.auth.methods).mockRejectedValue(new Error('down'))
    await expect(useAuthStore.getState().loadMethods()).resolves.toBeUndefined()
    expect(useAuthStore.getState()).toMatchObject({ identities: [EMAIL], identitiesStatus: 'error' })
  })

  it('a response that lands after an account switch writes neither the list nor the status', async () => {
    const read = heldMethodsRead()
    const pending = useAuthStore.getState().loadMethods()
    clearAccountState()
    useAuthStore.setState({ ...SIGNED_OUT, isLoading: false })
    read.settle({ identities: [EMAIL] })
    await pending
    expect(useAuthStore.getState()).toMatchObject({ identities: [], identitiesStatus: 'idle' })
  })

  it('a FAILURE that lands after an account switch writes no error into the next account', async () => {
    const read = heldMethodsRead()
    const pending = useAuthStore.getState().loadMethods()
    clearAccountState()
    useAuthStore.setState({ ...SIGNED_OUT, isLoading: false })
    read.fail(new Error('down'))
    await pending
    expect(useAuthStore.getState().identitiesStatus).toBe('idle')
  })

  it('sign-out returns the status to idle — the next account has asked for nothing', async () => {
    useAuthStore.setState({ identities: [EMAIL], identitiesStatus: 'ready' })
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({ identities: [], identitiesStatus: 'idle' })
  })
})
