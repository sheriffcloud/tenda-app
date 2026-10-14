/**
 * gigs.store's in-flight guards (#65).
 *
 * The store answers two different questions after an await. `latestRequest`
 * says "did a newer fetch supersede this one"; the generation says "does this
 * response belong to a previous ACCOUNT" — which a sign-out is, and which a
 * per-store request token cannot express. Both arms of both writers are here,
 * because the failure arms write as much as the success arms do.
 */
import { useGigsStore } from '@/stores/gigs.store'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import type { GigDetail } from '@tenda/shared'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
import { deferred } from '../__fixtures__/account-switch'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    gigs:    { get: jest.fn() },
    escrows: { review: jest.fn() },
  },
}))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => null),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

const getGigMock = api.gigs.get as jest.MockedFunction<typeof api.gigs.get>
const reviewMock = api.escrows.review as jest.MockedFunction<typeof api.escrows.review>

/** The row the endpoint answers with; nothing here reads it. */
function reviewRow(): Awaited<ReturnType<typeof api.escrows.review>> {
  return {
    id:          'r1',
    escrow_id:   'g1',
    reviewer_id: 'me',
    reviewee_id: 'them',
    score:       5,
    comment:     'good',
    created_at:  '2026-08-20T09:00:00.000Z',
  }
}

beforeEach(() => {
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null })
  jest.clearAllMocks()
})

test('a gig detail in flight at sign-out does not repopulate the selected gig', async () => {
  const response = deferred<GigDetail>()
  getGigMock.mockReturnValue(response.promise)

  const pending = useGigsStore.getState().fetchGigDetail('g1')
  await useAuthStore.getState().logout()
  response.resolve(gigDetail())
  await pending

  expect(useGigsStore.getState().selectedGig).toBeNull()
  // The reset ran while the request was still out, so the screen is not left
  // spinning on a load whose answer was then discarded.
  expect(useGigsStore.getState().isLoading).toBe(false)
})

test('a FAILED gig detail after sign-out does not banner an error the reader cannot place', async () => {
  // The catch writes an error naming a gig id. Landing it after the switch
  // shows the next account a failure for a gig they never opened — and, when
  // the failure is `gone`, silently drops whatever is in the slot.
  const response = deferred<GigDetail>()
  getGigMock.mockReturnValue(response.promise.then(() => Promise.reject(new Error('offline'))))

  const pending = useGigsStore.getState().fetchGigDetail('g1')
  await useAuthStore.getState().logout()
  response.resolve(gigDetail())
  await pending

  expect(useGigsStore.getState().error).toBeNull()
})

test("a review settling after sign-out does not switch off the new account's spinner", async () => {
  // `isLoading` is shared with the detail load, so this write is invisible
  // unless the next account has a load of its own running — which is exactly
  // when it does harm.
  const response = deferred<Awaited<ReturnType<typeof api.escrows.review>>>()
  reviewMock.mockReturnValue(response.promise)

  const pending = useGigsStore.getState().reviewEscrow('g1', { score: 5, comment: 'good' })
  await useAuthStore.getState().logout()
  useGigsStore.setState({ isLoading: true }) // the next account, mid-load
  response.resolve(reviewRow())
  await pending

  expect(useGigsStore.getState().isLoading).toBe(true)
})

test('a review that FAILS after sign-out does not switch off that spinner either', async () => {
  // Same slot, other arm. The caller still receives its rejection — the guard
  // suppresses the write, not the throw — which this asserts on both sides.
  const response = deferred<Awaited<ReturnType<typeof api.escrows.review>>>()
  reviewMock.mockReturnValue(response.promise.then(() => Promise.reject(new Error('offline'))))

  const pending = useGigsStore.getState().reviewEscrow('g1', { score: 5, comment: 'good' })
  await useAuthStore.getState().logout()
  useGigsStore.setState({ isLoading: true })
  response.resolve(reviewRow())

  await expect(pending).rejects.toThrow('offline')
  expect(useGigsStore.getState().isLoading).toBe(true)
})
