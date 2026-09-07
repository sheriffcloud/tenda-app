/**
 * gigs.store — one slot, many gigs: the stale-token guard (a late response
 * writes NOTHING), the gone/transient split on refetch, and the id-carrying
 * error.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError } from '@tenda/shared'

const { getMock, reviewMock } = vi.hoisted(() => ({ getMock: vi.fn(), reviewMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  api: {
    gigs: { get: (...a: unknown[]) => getMock(...a) },
    escrows: { review: (...a: unknown[]) => reviewMock(...a) },
  },
}))

import { useGigsStore } from '@/stores/gigs.store'

function gig(id: string) {
  return { escrow_id: id, title: `Gig ${id}` }
}

beforeEach(() => {
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null })
})

test('loads a gig into the slot', async () => {
  getMock.mockResolvedValue(gig('g1'))
  await useGigsStore.getState().fetchGigDetail('g1')
  expect(useGigsStore.getState().selectedGig?.escrow_id).toBe('g1')
  expect(useGigsStore.getState().error).toBeNull()
})

test('starting a fetch for a DIFFERENT gig drops the previous one immediately', async () => {
  getMock.mockResolvedValue(gig('g1'))
  await useGigsStore.getState().fetchGigDetail('g1')
  let resolve!: (v: unknown) => void
  getMock.mockReturnValue(new Promise((res) => { resolve = res }))
  const pending = useGigsStore.getState().fetchGigDetail('g2')
  // g1 must not render while g2 is in flight (the previous VIEWER's actions).
  expect(useGigsStore.getState().selectedGig).toBeNull()
  resolve(gig('g2'))
  await pending
  expect(useGigsStore.getState().selectedGig?.escrow_id).toBe('g2')
})

test('a superseded response writes NOTHING — success or failure alike', async () => {
  let resolveFirst!: (v: unknown) => void
  getMock.mockReturnValueOnce(new Promise((res) => { resolveFirst = res }))
  const first = useGigsStore.getState().fetchGigDetail('g1')
  getMock.mockResolvedValueOnce(gig('g2'))
  await useGigsStore.getState().fetchGigDetail('g2')
  resolveFirst(gig('g1')) // late success for the superseded fetch
  await first
  expect(useGigsStore.getState().selectedGig?.escrow_id).toBe('g2')
})

test('a gone refetch DROPS the gig it was refreshing', async () => {
  getMock.mockResolvedValueOnce(gig('g1'))
  await useGigsStore.getState().fetchGigDetail('g1')
  getMock.mockRejectedValueOnce(new ApiClientError(404, 'Not Found', 'gone', 'NOT_FOUND'))
  await useGigsStore.getState().fetchGigDetail('g1')
  expect(useGigsStore.getState().selectedGig).toBeNull()
  expect(useGigsStore.getState().error).toMatchObject({ id: 'g1', gone: true })
})

test('a transient refetch failure KEEPS the gig on screen', async () => {
  getMock.mockResolvedValueOnce(gig('g1'))
  await useGigsStore.getState().fetchGigDetail('g1')
  getMock.mockRejectedValueOnce(new TypeError('Network request failed'))
  await useGigsStore.getState().fetchGigDetail('g1')
  expect(useGigsStore.getState().selectedGig?.escrow_id).toBe('g1')
  expect(useGigsStore.getState().error).toMatchObject({ id: 'g1', gone: false })
})

test('reviewEscrow submits and rethrows failures', async () => {
  reviewMock.mockResolvedValue({})
  await useGigsStore.getState().reviewEscrow('g1', { score: 5 })
  expect(reviewMock).toHaveBeenCalledWith({ id: 'g1' }, { score: 5 })
  reviewMock.mockRejectedValue(new Error('nope'))
  await expect(useGigsStore.getState().reviewEscrow('g1', { score: 5 })).rejects.toThrow('nope')
})
