/**
 * The gig-detail store's single `selectedGig` slot.
 *
 * One slot serves every gig, so the interesting behaviour is what happens when
 * the id CHANGES: a gig left over from the previous screen must not stay
 * readable while a different one loads. Since approval mode that is not
 * cosmetic — the leftover carries the previous viewer's `viewer` block, i.e.
 * another user's Apply/Withdraw state.
 *
 * The second axis is WHICH failure. A 404 means the gig is unreadable for good
 * (deleted, or a takedown this viewer may no longer see) and the slot must be
 * emptied, or the screen keeps rendering a listing the server has stopped
 * serving with every action button live. A transient failure must do the
 * opposite and leave it alone.
 */
import { useGigsStore } from '../gigs.store'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
import { ApiClientError } from '@/api/client'

const mockGet = jest.fn()
const mockReview = jest.fn()
jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: {
    gigs: { get: (...args: unknown[]) => mockGet(...args) },
    escrows: { review: (...args: unknown[]) => mockReview(...args) },
  },
}))

/** The envelope the real client throws for a route that refuses to serve a row. */
function notFound(message = 'Gig not found'): ApiClientError {
  return new ApiClientError(404, 'Not Found', message, 'NOT_FOUND')
}

beforeEach(() => {
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null })
})

test('a successful load stores the gig and clears the loading flag', async () => {
  const gig = gigDetail({ escrow_id: 'gig-1' })
  mockGet.mockResolvedValue(gig)

  await useGigsStore.getState().fetchGigDetail('gig-1')

  expect(mockGet).toHaveBeenCalledWith({ id: 'gig-1' })
  expect(useGigsStore.getState().selectedGig).toEqual(gig)
  expect(useGigsStore.getState().isLoading).toBe(false)
  expect(useGigsStore.getState().error).toBeNull()
})

test('loading a DIFFERENT gig drops the previous one immediately', () => {
  useGigsStore.setState({ selectedGig: gigDetail({ escrow_id: 'gig-1' }) })
  // Never awaited: the point is the state BEFORE the response lands.
  mockGet.mockReturnValue(new Promise(() => {}))
  void useGigsStore.getState().fetchGigDetail('gig-2')

  expect(useGigsStore.getState().selectedGig).toBeNull()
  expect(useGigsStore.getState().isLoading).toBe(true)
})

test('re-loading the SAME gig keeps it on screen while it revalidates', () => {
  const gig = gigDetail({ escrow_id: 'gig-1' })
  useGigsStore.setState({ selectedGig: gig })
  mockGet.mockReturnValue(new Promise(() => {}))
  void useGigsStore.getState().fetchGigDetail('gig-1')

  // A pull-to-refresh must not blank the screen it is refreshing.
  expect(useGigsStore.getState().selectedGig).toEqual(gig)
})

test('a failure records WHICH gig it was for', async () => {
  mockGet.mockRejectedValue(new Error('Network request failed'))

  await useGigsStore.getState().fetchGigDetail('gig-1')

  expect(useGigsStore.getState().error).toEqual({
    // `error` alone cannot say which gig failed, and one slot serves them all —
    // without the id, opening any other gig would show this failure.
    id: 'gig-1',
    message: 'Network request failed',
    gone: false,
  })
  expect(useGigsStore.getState().isLoading).toBe(false)
})

test('a new load clears a previous failure', async () => {
  useGigsStore.setState({ error: { id: 'gig-1', message: 'boom', gone: false } })
  mockGet.mockResolvedValue(gigDetail({ escrow_id: 'gig-2' }))

  await useGigsStore.getState().fetchGigDetail('gig-2')

  expect(useGigsStore.getState().error).toBeNull()
})

// ── which failures empty the slot ───────────────────────────────────────────

test('a 404 on refetch DROPS the gig it was refreshing', async () => {
  // The takedown case: the screen is open, an admin hides the gig, the focus
  // refetch (or a pull-to-refresh) 404s. Leaving the gig in place is what let
  // the stale screen keep offering Accept.
  const gig = gigDetail({ escrow_id: 'gig-1' })
  useGigsStore.setState({ selectedGig: gig })
  mockGet.mockRejectedValue(notFound())

  await useGigsStore.getState().fetchGigDetail('gig-1')

  expect(useGigsStore.getState().selectedGig).toBeNull()
  expect(useGigsStore.getState().error).toEqual({
    id: 'gig-1',
    message: 'Gig not found',
    gone: true,
  })
})

test('a NETWORK failure keeps the gig on screen', async () => {
  // The opposite mistake, and just as bad: blanking a good screen because one
  // request was lost. Only an authoritative "you cannot read this" empties it.
  const gig = gigDetail({ escrow_id: 'gig-1' })
  useGigsStore.setState({ selectedGig: gig })
  mockGet.mockRejectedValue(new Error('Network request failed'))

  await useGigsStore.getState().fetchGigDetail('gig-1')

  expect(useGigsStore.getState().selectedGig).toEqual(gig)
  expect(useGigsStore.getState().error?.gone).toBe(false)
})

test.each([
  ['403 forbidden', new ApiClientError(403, 'Forbidden', 'Nope', 'FORBIDDEN')],
  ['500 server error', new ApiClientError(500, 'Internal', 'Boom', 'INTERNAL_ERROR')],
  ['429 rate limit', new ApiClientError(429, 'Too Many Requests', 'Slow down')],
])('a %s is transient — the gig stays', async (_label, thrown) => {
  const gig = gigDetail({ escrow_id: 'gig-1' })
  useGigsStore.setState({ selectedGig: gig })
  mockGet.mockRejectedValue(thrown)

  await useGigsStore.getState().fetchGigDetail('gig-1')

  expect(useGigsStore.getState().selectedGig).toEqual(gig)
  expect(useGigsStore.getState().error?.gone).toBe(false)
})

// ── superseded responses ────────────────────────────────────────────────────
//
// One slot serves every gig, so a response that lands after a NEWER request
// started is not just stale — it is about a different subject. Both directions
// used to end on the same dead screen: the gate renders a gig only when the id
// matches and surfaces an error only when the id matches, so a mismatch in
// either slot leaves a spinner with nothing loading and no way out but leaving.
//
// The pre-fetch reset cannot help here: the slot is filled AFTER the first
// request is already in flight. Only a request token can.

test('a LATE 404 for a superseded gig is discarded entirely', async () => {
  // Screen A opens gig-1; the user navigates before it answers; screen B loads
  // gig-2; then gig-1 finally 404s. Nobody is looking at gig-1, so its failure
  // is not news — recording it would evict gig-2's slot and strand screen B.
  let rejectFirst: (e: unknown) => void = () => {}
  mockGet.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectFirst = reject
    }),
  )
  const first = useGigsStore.getState().fetchGigDetail('gig-1')

  const second = gigDetail({ escrow_id: 'gig-2' })
  mockGet.mockResolvedValueOnce(second)
  await useGigsStore.getState().fetchGigDetail('gig-2')
  expect(useGigsStore.getState().selectedGig).toEqual(second)

  rejectFirst(notFound())
  await first

  expect(useGigsStore.getState().selectedGig).toEqual(second)
  // No error recorded at all — not gig-1's, and emphatically not one that the
  // gate would then refuse to show while also having no gig to render.
  expect(useGigsStore.getState().error).toBeNull()
  expect(useGigsStore.getState().isLoading).toBe(false)
})

test('a LATE SUCCESS for a superseded gig never replaces the current one', async () => {
  // The variant that is worse, because it looks like everything worked: gig-1
  // resolves fine, overwrites gig-2 in the shared slot, and screen B — still
  // asking for gig-2 — renders a spinner over a gig that had already loaded.
  let resolveFirst: (v: unknown) => void = () => {}
  mockGet.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve
    }),
  )
  const first = useGigsStore.getState().fetchGigDetail('gig-1')

  const second = gigDetail({ escrow_id: 'gig-2' })
  mockGet.mockResolvedValueOnce(second)
  await useGigsStore.getState().fetchGigDetail('gig-2')

  resolveFirst(gigDetail({ escrow_id: 'gig-1' }))
  await first

  expect(useGigsStore.getState().selectedGig).toEqual(second)
  expect(useGigsStore.getState().error).toBeNull()
})

test('a superseded response writes NOTHING, isLoading included', async () => {
  // Scoped honestly: no screen reads this store's `isLoading` today — the gate
  // decides on selectedGig/error/id — so this pins internal consistency, not a
  // spinner anyone can see. (The exchange hook's equivalent flag IS rendered,
  // and its guard is tested there for the user-visible consequence.) It earns
  // its place by failing if a superseded response starts writing again.
  let resolveFirst: (v: unknown) => void = () => {}
  mockGet.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
  const first = useGigsStore.getState().fetchGigDetail('gig-1')

  // gig-2 is requested and left IN FLIGHT (never resolved).
  mockGet.mockReturnValueOnce(new Promise(() => {}))
  void useGigsStore.getState().fetchGigDetail('gig-2')
  expect(useGigsStore.getState().isLoading).toBe(true)

  resolveFirst(gigDetail({ escrow_id: 'gig-1' }))
  await first

  expect(useGigsStore.getState().isLoading).toBe(true)
  expect(useGigsStore.getState().selectedGig).toBeNull()
})

test('reviewEscrow clears the loading flag when it SUCCEEDS', async () => {
  // The failure path below was pinned; the success path was not, which left the
  // one line that turns the sheet's spinner off unasserted. A regression there
  // is a spinner that never stops on a review the user already submitted.
  mockReview.mockResolvedValue(undefined)
  useGigsStore.setState({ isLoading: true })

  await useGigsStore.getState().reviewEscrow('gig-1', { score: 5 })

  expect(mockReview).toHaveBeenCalledWith({ id: 'gig-1' }, { score: 5 })
  expect(useGigsStore.getState().isLoading).toBe(false)
})

test('reviewEscrow rethrows so the sheet can keep the input', async () => {
  mockReview.mockRejectedValue(new Error('already reviewed'))
  await expect(
    useGigsStore.getState().reviewEscrow('gig-1', { score: 5 }),
  ).rejects.toThrow('already reviewed')
  expect(useGigsStore.getState().isLoading).toBe(false)
})
