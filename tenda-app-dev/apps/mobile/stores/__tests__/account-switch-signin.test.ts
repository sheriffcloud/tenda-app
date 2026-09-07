/**
 * Signing IN is an account transition too (#65).
 *
 * The signed-out window is not inert. Gigs are browsable anonymously, so a
 * detail fetch can genuinely be in flight when someone signs in — and the
 * response it carries was scoped to the ANONYMOUS viewer, so writing it
 * afterwards shows a signed-in reader an Apply/Withdraw block computed for
 * nobody. Each sign-in path calls `beginAccountSession` itself, so each needs
 * its own case: a single one leaves the other's call unproven.
 *
 * The third case is the mirror image — a sign-in that FAILS late, whose
 * cleanup would otherwise sign out whoever succeeded in the meantime.
 */
import { useAuthStore } from '@/stores/auth.store'
import { useGigsStore } from '@/stores/gigs.store'
import { api } from '@/api/client'
import { clearAuthStorage } from '@/lib/secure-store'
import { signInWithWallet as walletSignIn } from '@/wallet/auth'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
import {
  authUser,
  deferred,
  meUser,
  unauthorized,
  walletAdapter,
  walletResult,
} from '../__fixtures__/account-switch'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    auth:  { me: jest.fn(), methods: jest.fn(), verify: jest.fn() },
    users: { me: jest.fn() },
    gigs:  { get: jest.fn() },
  },
}))
jest.mock('@/lib/device', () => ({ isSeekerDevice: () => false }))
jest.mock('@/wallet/auth', () => ({ signInWithWallet: jest.fn(), linkWalletWith: jest.fn() }))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => null),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

const verifyMock = api.auth.verify as jest.MockedFunction<typeof api.auth.verify>
const methodsMock = api.auth.methods as jest.MockedFunction<typeof api.auth.methods>
const usersMeMock = api.users.me as jest.MockedFunction<typeof api.users.me>
const getGigMock = api.gigs.get as jest.MockedFunction<typeof api.gigs.get>
const walletSignInMock = walletSignIn as jest.MockedFunction<typeof walletSignIn>
const clearAuthStorageMock = clearAuthStorage as jest.MockedFunction<typeof clearAuthStorage>

beforeEach(() => {
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null })
  useAuthStore.setState({ user: null, jwt: null, isAuthenticated: false, walletsStatus: 'idle' })
  jest.clearAllMocks()
  usersMeMock.mockResolvedValue({ wallets: [], profile_complete: true, user: meUser() })
  methodsMock.mockResolvedValue({ identities: [] })
})

test('signing in with a code discards a response issued while signed out', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.gigs.get>>>()
  getGigMock.mockReturnValue(response.promise)
  verifyMock.mockResolvedValue({ token: 'jwt-b', user: authUser(), is_new: false })

  const pending = useGigsStore.getState().fetchGigDetail('g1')
  await useAuthStore.getState().signInWithVerify({
    method: 'email',
    identifier: 'b@example.com',
    code: '123456',
  })
  response.resolve(gigDetail())
  await pending

  expect(useGigsStore.getState().selectedGig).toBeNull()
})

test('signing in with a wallet discards a response issued while signed out', async () => {
  const response = deferred<Awaited<ReturnType<typeof api.gigs.get>>>()
  getGigMock.mockReturnValue(response.promise)
  walletSignInMock.mockResolvedValue(walletResult())

  const pending = useGigsStore.getState().fetchGigDetail('g1')
  await useAuthStore.getState().signInWithWallet(walletAdapter())
  response.resolve(gigDetail())
  await pending

  expect(useGigsStore.getState().selectedGig).toBeNull()
})

test('a stale sign-in 401 does not sign out the account that succeeded meanwhile', async () => {
  // purgeIfStaleSession exists to clear a dead stored token so the NEXT attempt
  // starts clean. Landed late it does the opposite: it wipes the credentials of
  // whoever signed in since and drops them to the welcome screen. Reachable
  // without contrivance — a code submission that hangs while the reader gives
  // up and signs in another way.
  const slow = deferred<Awaited<ReturnType<typeof api.auth.verify>>>()
  verifyMock.mockReturnValue(slow.promise.then(() => Promise.reject(unauthorized())))

  const abandoned = useAuthStore.getState().signInWithVerify({
    method: 'email',
    identifier: 'a@example.com',
    code: '111111',
  })

  walletSignInMock.mockResolvedValue(walletResult())
  await useAuthStore.getState().signInWithWallet(walletAdapter())
  expect(useAuthStore.getState().isAuthenticated).toBe(true)

  clearAuthStorageMock.mockClear()
  slow.resolve({ token: 'x', user: authUser(), is_new: false })
  await expect(abandoned).rejects.toThrow()

  expect(clearAuthStorageMock).not.toHaveBeenCalled()
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
  expect(useAuthStore.getState().jwt).toBe('jwt-b')
})
