/**
 * The approval-mode client actions.
 *
 * What matters here is the failure path: the server words its application
 * errors for the person reading them (capacity reached, application expired,
 * wrong status), so the hook must SURFACE that wording rather than replace it
 * with a generic retry message — which is the difference between a worker
 * knowing they are at their cap and thinking the app is broken.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { ApiClientError } from '@tenda/shared'
import { useApplicantList, useApplications } from '../useApplications'
import { APPLY_SUCCESS, RELEASE_SUCCESS, WITHDRAW_SUCCESS } from '@tenda/shared'

// jest hoists jest.mock() above the file, so factory-referenced fakes must
// carry the `mock` prefix the transform whitelists.
const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}))

const mockApply = jest.fn()
const mockWithdraw = jest.fn()
const mockApplicants = jest.fn()
const mockRelease = jest.fn()
jest.mock('@/api/client', () => ({
  ApiClientError: jest.requireActual('@/api/request').ApiClientError,
  api: {
    gigs: {
      apply: (...args: unknown[]) => mockApply(...args),
      withdrawApplication: (...args: unknown[]) => mockWithdraw(...args),
      applicants: (...args: unknown[]) => mockApplicants(...args),
    },
    escrows: { release: (...args: unknown[]) => mockRelease(...args) },
  },
}))

const ESCROW = 'escrow-1'
const WALLET = '0xWorker'

beforeEach(() => {
  mockApply.mockResolvedValue({ id: 'app-1' })
  mockWithdraw.mockResolvedValue({ withdrawn: true })
  mockRelease.mockResolvedValue({ released_at: '2026-07-27T00:00:00.000Z' })
  mockApplicants.mockResolvedValue({ data: [] })
})

describe('useApplications', () => {
  it('applies with a trimmed message and reports success', async () => {
    const onChanged = jest.fn()
    const { result } = renderHook(() => useApplications({ onChanged }))

    await act(async () => {
      await result.current.apply(ESCROW, 'pick me', WALLET)
    })

    expect(mockApply).toHaveBeenCalledWith(
      { id: ESCROW },
      { wallet_address: WALLET, message: 'pick me' },
    )
    expect(mockShowToast).toHaveBeenCalledWith('success', APPLY_SUCCESS)
    expect(onChanged).toHaveBeenCalled()
  })

  it('still sends the chosen wallet when there is no pitch', async () => {
    // The wallet is not optional the way the pitch is: an assignment BAKES it
    // on chain, so omitting the body here would hand the choice back to the
    // server's primary-wallet default — the bug the picker exists to close.
    const { result } = renderHook(() => useApplications())
    await act(async () => {
      await result.current.apply(ESCROW, null, WALLET)
    })
    expect(mockApply).toHaveBeenCalledWith({ id: ESCROW }, { wallet_address: WALLET })
  })

  it("surfaces the server's own explanation on failure", async () => {
    mockApply.mockRejectedValue(
      new ApiClientError(403, 'APPLICATION_LIMIT_REACHED', 'You can have 5 open applications at a time.'),
    )
    const onChanged = jest.fn()
    const { result } = renderHook(() => useApplications({ onChanged }))

    let ok = true
    await act(async () => {
      ok = await result.current.apply(ESCROW, null, WALLET)
    })

    expect(ok).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith('error', 'You can have 5 open applications at a time.')
    // Nothing changed, so nothing should be refetched.
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('falls back to its own wording only when the failure carries none', async () => {
    mockApply.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useApplications())
    await act(async () => {
      await result.current.apply(ESCROW, null, WALLET)
    })
    expect(mockShowToast).toHaveBeenCalledWith('error', expect.stringMatching(/could not send/i))
  })

  it('withdraws and releases through their own endpoints', async () => {
    const { result } = renderHook(() => useApplications())

    await act(async () => {
      await result.current.withdraw(ESCROW)
    })
    expect(mockWithdraw).toHaveBeenCalledWith({ id: ESCROW })
    expect(mockShowToast).toHaveBeenCalledWith('success', WITHDRAW_SUCCESS)

    await act(async () => {
      await result.current.release(ESCROW)
    })
    expect(mockRelease).toHaveBeenCalledWith({ id: ESCROW })
    // The escrow has NOT moved — only the poster's unassign does that — so the
    // copy says the poster was told, never that the gig is free.
    expect(mockShowToast).toHaveBeenCalledWith('success', RELEASE_SUCCESS)
    expect(RELEASE_SUCCESS).not.toMatch(/released the gig|gig is open/i)
  })

  it('clears busy even when the action throws', async () => {
    mockWithdraw.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useApplications())
    await act(async () => {
      await result.current.withdraw(ESCROW)
    })
    expect(result.current.busy).toBe(false)
  })
})

describe('useApplicantList', () => {
  it('asks the server for its own live default when filtering to waiting', async () => {
    const { result } = renderHook(() => useApplicantList(ESCROW, 'open'))
    await act(async () => {
      await result.current.load()
    })
    // No `status` at all: which statuses count as live is the server's rule,
    // and restating it here is how the two drift.
    expect(mockApplicants).toHaveBeenCalledWith({ id: ESCROW }, undefined)
  })

  it('enumerates the SHARED status tuple for the All filter', async () => {
    const { result } = renderHook(() => useApplicantList(ESCROW, 'all'))
    await act(async () => {
      await result.current.load()
    })
    const [, query] = mockApplicants.mock.calls[0]
    // Passed as the shared tuple; the query builder serialises it CSV, exactly
    // as it does for GigListQuery.status.
    expect(query.status).toEqual(
      expect.arrayContaining(['open', 'assigned', 'passed', 'expired', 'withdrawn']),
    )
  })

  it('reports a load failure without leaving the list stuck as null', async () => {
    mockApplicants.mockRejectedValue(new ApiClientError(403, 'FORBIDDEN', 'Only the poster can see applicants'))
    const { result } = renderHook(() => useApplicantList(ESCROW, 'open'))
    await act(async () => {
      await result.current.load()
    })
    await waitFor(() => expect(result.current.error).toBe('Only the poster can see applicants'))
    // Empty, not null — null means "still loading", which would hang forever.
    expect(result.current.applicants).toEqual([])
  })
})

// ── taken down while the screen was open (CO1) ──────────────────────────────

test('a takedown refusal re-reads the gig, though the action FAILED', () => {
  // The one failure that still changes what the caller is displaying: the gig
  // was pulled, so Apply must stop being offered. Every other failure leaves
  // the screen exactly as it was — see the next test.
  const onChanged = jest.fn()
  const { result } = renderHook(() => useApplications({ onChanged }))

  return act(async () => {
    mockApply.mockRejectedValueOnce(
      new ApiClientError(
        409,
        'Conflict',
        'This listing has been removed and is no longer open to new participants.',
        'ESCROW_TAKEN_DOWN',
      ),
    )
    const ok = await result.current.apply(ESCROW, null, WALLET)

    expect(ok).toBe(false)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(mockShowToast).toHaveBeenCalledWith(
      'error',
      'This listing has been removed and is no longer open to new participants.',
    )
  })
})

test('any OTHER failure leaves the screen alone', () => {
  // Refetching here would reload the gig under someone who simply hit their
  // application cap — nothing about the gig changed, so nothing should move.
  const onChanged = jest.fn()
  const { result } = renderHook(() => useApplications({ onChanged }))

  return act(async () => {
    mockApply.mockRejectedValueOnce(
      new ApiClientError(
        409,
        'Conflict',
        'You have too many open applications',
        'APPLICATION_LIMIT_REACHED',
      ),
    )
    await result.current.apply(ESCROW, null, WALLET)

    expect(onChanged).not.toHaveBeenCalled()
  })
})
