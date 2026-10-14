/**
 * auth.store's post-session writers, which the account-scope guard does NOT
 * cover (#65).
 *
 * The store is excused from registering a reset because it clears itself — it
 * is the caller of `clearAccountState`. That excuse answers one question only:
 * "does someone empty this at the switch". It says nothing about the second,
 * "can a response already on its way write into the next account", and web's
 * #45 left all four of its writers unguarded on exactly that reading.
 *
 * The two sign-IN paths, which open a generation rather than close one, are in
 * `account-switch-signin.test.ts`.
 */
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { clearAuthStorage } from '@/lib/secure-store'
import { authUser, deferred, flush, identity, meUser, unauthorized } from '../__fixtures__/account-switch'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    auth:  { me: jest.fn(), methods: jest.fn() },
    users: { me: jest.fn() },
  },
}))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => 'jwt-account-a'),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

const authMeMock = api.auth.me as jest.MockedFunction<typeof api.auth.me>
const methodsMock = api.auth.methods as jest.MockedFunction<typeof api.auth.methods>
const usersMeMock = api.users.me as jest.MockedFunction<typeof api.users.me>
const clearAuthStorageMock = clearAuthStorage as jest.MockedFunction<typeof clearAuthStorage>

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    jwt: null,
    identities: [],
    wallets: [],
    walletsStatus: 'idle',
    isAuthenticated: false,
  })
  jest.clearAllMocks()
})

test('a sign-out during the STORED-TOKEN read abandons the restore', async () => {
  // The earlier of loadSession's two awaits. `logout` bumps the generation
  // synchronously, before it awaits anything, so the storage continuation is
  // already stale when it resumes — and the request is never even issued.
  const response = deferred<Awaited<ReturnType<typeof api.auth.me>>>()
  authMeMock.mockReturnValue(response.promise)

  const pending = useAuthStore.getState().loadSession()
  await useAuthStore.getState().logout()
  response.resolve(authUser())
  await pending

  expect(authMeMock).not.toHaveBeenCalled()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
})

test('a sign-out while /me is in flight does not sign the user back in', async () => {
  // The LATER await, and a separate case on purpose: the two guards cover for
  // each other, so a single case leaves whichever it does not reach unproven —
  // measured, both mutants survived until this split.
  const response = deferred<Awaited<ReturnType<typeof api.auth.me>>>()
  authMeMock.mockReturnValue(response.promise)

  const pending = useAuthStore.getState().loadSession()
  await flush()
  expect(authMeMock).toHaveBeenCalled()

  await useAuthStore.getState().logout()
  response.resolve(authUser())
  await pending

  const auth = useAuthStore.getState()
  // The whole session, not just the profile: this writer sets `isAuthenticated`
  // too, so an unguarded landing would put a signed-out reader back inside.
  expect(auth.isAuthenticated).toBe(false)
  expect(auth.user).toBeNull()
})

test("a stale 401 does not wipe the NEW account's stored credentials", async () => {
  // The sharpest of the three. loadSession answers a 401 by purging the token
  // from the device — correct for the session that got the 401, catastrophic
  // one account later: the person who signed in since is signed straight back
  // out with their credentials gone. So the guard precedes clearAuthStorage,
  // not merely the `set`.
  const response = deferred<Awaited<ReturnType<typeof api.auth.me>>>()
  authMeMock.mockReturnValue(response.promise.then(() => Promise.reject(unauthorized())))

  const pending = useAuthStore.getState().loadSession()
  await flush()
  await useAuthStore.getState().logout()
  clearAuthStorageMock.mockClear() // logout legitimately calls it; the stale 401 must not
  response.resolve(authUser())
  await pending

  expect(clearAuthStorageMock).not.toHaveBeenCalled()
})

test('a profile refresh in flight at sign-out does not restore the previous user', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.auth.me>>>()
  authMeMock.mockReturnValue(response.promise)

  const pending = useAuthStore.getState().refreshUser()
  await useAuthStore.getState().logout()
  response.resolve(authUser())
  await pending

  expect(useAuthStore.getState().user).toBeNull()
})

test('a sign-in methods load in flight at sign-out does not leak the previous identities', async () => {
  // `identities` is the security screen's list of linked email, phone and
  // wallets — one person's contact details on another person's settings page.
  const response = deferred<Awaited<ReturnType<typeof api.auth.methods>>>()
  methodsMock.mockReturnValue(response.promise)

  const pending = useAuthStore.getState().loadMethods()
  await useAuthStore.getState().logout()
  response.resolve({ identities: [identity()] })
  await pending

  expect(useAuthStore.getState().identities).toEqual([])
})

test('a wallets load in flight at sign-out does not leak the previous addresses', async () => {
  // The longest-lived request in the store — it is wrapped in withRetry — so
  // the likeliest of all of them to outlive the account that issued it.
  const response = deferred<Awaited<ReturnType<typeof api.users.me>>>()
  usersMeMock.mockReturnValue(response.promise)

  const pending = useAuthStore.getState().refreshMe()
  await useAuthStore.getState().logout()
  response.resolve({ wallets: [], profile_complete: true, user: meUser() })
  await pending

  const auth = useAuthStore.getState()
  expect(auth.wallets).toEqual([])
  // And the status is not left claiming a successful load for a discarded one.
  expect(auth.walletsStatus).not.toBe('ready')
})

test('a FAILED wallets load after sign-out does not post an error to the new account', async () => {
  // The catch writes too — it moves walletsStatus to 'error' — so guarding only
  // the success path leaves a retry banner belonging to nobody.
  const response = deferred<Awaited<ReturnType<typeof api.users.me>>>()
  usersMeMock.mockReturnValue(response.promise.then(() => Promise.reject(unauthorized())))

  const pending = useAuthStore.getState().refreshMe()
  await useAuthStore.getState().logout()
  response.resolve({ wallets: [], profile_complete: true, user: meUser() })
  await pending

  expect(useAuthStore.getState().walletsStatus).not.toBe('error')
})
