/**
 * useApplications + useGigApprovalFlow — the off-chain approval actions with
 * their shared success/confirm copy, the takedown re-read on failure, and
 * the one action (unassign) that routes back to the wallet gate.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  APPLY_SUCCESS,
  ApiClientError,
  RELEASE_CONFIRM,
  WITHDRAW_CONFIRM,
  WITHDRAW_SUCCESS,
} from '@tenda/shared'

const { applyMock, withdrawMock, releaseMock, applicantsMock, toastMock, pushMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  withdrawMock: vi.fn(),
  releaseMock: vi.fn(),
  applicantsMock: vi.fn(),
  toastMock: vi.fn(),
  pushMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastMock(...a) }))
vi.mock('@/api/client', () => ({
  api: {
    gigs: {
      apply: (...a: unknown[]) => applyMock(...a),
      withdrawApplication: (...a: unknown[]) => withdrawMock(...a),
      applicants: (...a: unknown[]) => applicantsMock(...a),
    },
    escrows: { release: (...a: unknown[]) => releaseMock(...a) },
  },
}))

import { useApplications, useApplicantList } from '@/hooks/gig/useApplications'
import { useGigApprovalFlow } from '@/hooks/gig/useGigApprovalFlow'

beforeEach(() => {
  applyMock.mockResolvedValue({})
  withdrawMock.mockResolvedValue({})
  releaseMock.mockResolvedValue({})
  applicantsMock.mockResolvedValue({ data: [] })
})

describe('useApplications', () => {
  test('apply sends the trimmed pitch (or none) and toasts the shared success', async () => {
    const onChanged = vi.fn()
    const { result } = renderHook(() => useApplications({ onChanged }))
    await act(async () => {
      expect(await result.current.apply('e1', 'pick me', 'Wallet11')).toBe(true)
    })
    expect(applyMock).toHaveBeenCalledWith({ id: 'e1' }, { wallet_address: 'Wallet11', message: 'pick me' })
    expect(toastMock).toHaveBeenCalledWith('success', APPLY_SUCCESS)
    expect(onChanged).toHaveBeenCalled()

    await act(async () => {
      await result.current.apply('e1', null, 'Wallet11')
    })
    // No pitch still declares the wallet — the server records it either way.
    expect(applyMock).toHaveBeenLastCalledWith({ id: 'e1' }, { wallet_address: 'Wallet11' })
  })

  test("a failure surfaces the SERVER's message and leaves the screen alone", async () => {
    const onChanged = vi.fn()
    applyMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'You have 3 open applications already', 'LIMIT'))
    const { result } = renderHook(() => useApplications({ onChanged }))
    await act(async () => {
      expect(await result.current.apply('e1', null, 'Wallet11')).toBe(false)
    })
    expect(toastMock).toHaveBeenCalledWith('error', 'You have 3 open applications already')
    expect(onChanged).not.toHaveBeenCalled()
  })

  test('a takedown refusal is the ONE failure that still re-reads', async () => {
    const onChanged = vi.fn()
    applyMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'pulled', 'ESCROW_TAKEN_DOWN'))
    const { result } = renderHook(() => useApplications({ onChanged }))
    await act(async () => {
      await result.current.apply('e1', null, 'Wallet11')
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  test('withdraw and release hit their own endpoints', async () => {
    const { result } = renderHook(() => useApplications())
    await act(async () => {
      await result.current.withdraw('e1')
      await result.current.release('e1')
    })
    expect(withdrawMock).toHaveBeenCalledWith({ id: 'e1' })
    expect(releaseMock).toHaveBeenCalledWith({ id: 'e1' })
    expect(toastMock).toHaveBeenCalledWith('success', WITHDRAW_SUCCESS)
  })
})

describe('useApplicantList', () => {
  test('the Waiting filter omits status (server default); All passes the shared tuple', async () => {
    const { result, rerender } = renderHook(
      ({ filter }: { filter: 'open' | 'all' }) => useApplicantList('e1', filter),
      { initialProps: { filter: 'open' as 'open' | 'all' } },
    )
    await act(async () => {
      await result.current.load()
    })
    expect(applicantsMock).toHaveBeenCalledWith({ id: 'e1' }, undefined)
    rerender({ filter: 'all' })
    await act(async () => {
      await result.current.load()
    })
    expect(applicantsMock).toHaveBeenLastCalledWith(
      { id: 'e1' },
      { status: expect.arrayContaining(['open', 'assigned', 'withdrawn']) },
    )
  })

  test('a failed load surfaces the message with an empty list', async () => {
    applicantsMock.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useApplicantList('e1', 'open'))
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.applicants).toEqual([])
    expect(result.current.error).toBe('down')
  })
})

describe('useGigApprovalFlow', () => {
  const ARGS = { escrowId: 'e1', onChanged: vi.fn(), onRequestUnassign: vi.fn() }

  test('routes each action: apply opens the dialog, viewApplicants navigates, unassign goes to the gate', () => {
    const onRequestUnassign = vi.fn()
    const { result } = renderHook(() => useGigApprovalFlow({ ...ARGS, onRequestUnassign }))
    act(() => result.current.handleAction('apply'))
    expect(result.current.applyOpen).toBe(true)
    act(() => result.current.handleAction('viewApplicants'))
    // Under /my-gigs since #17: the applicants list is a WORKSPACE surface
    // beside the my-gigs column, and /gig/<id> is the public listing.
    expect(pushMock).toHaveBeenCalledWith('/my-gigs/e1/applicants')
    act(() => result.current.handleAction('unassign'))
    expect(onRequestUnassign).toHaveBeenCalled()
  })

  test('withdraw/release ask first with the SHARED confirm copy, then act', async () => {
    const { result } = renderHook(() => useGigApprovalFlow(ARGS))
    act(() => result.current.handleAction('withdraw'))
    expect(result.current.confirmDialog.open).toBe(true)
    expect(result.current.confirmDialog.title).toBe(WITHDRAW_CONFIRM.title)
    await act(async () => {
      result.current.confirmDialog.onConfirm()
    })
    expect(withdrawMock).toHaveBeenCalledWith({ id: 'e1' })

    act(() => result.current.handleAction('release'))
    expect(result.current.confirmDialog.title).toBe(RELEASE_CONFIRM.title)
    await act(async () => {
      result.current.confirmDialog.onConfirm()
    })
    expect(releaseMock).toHaveBeenCalledWith({ id: 'e1' })
  })

  test('the apply passthrough forwards BOTH the pitch and the wallet, in order', async () => {
    // ApplyDialog calls this with (message, wallet); a swapped or dropped arg
    // here records the wrong wallet server-side and no other suite would see it.
    const { result } = renderHook(() => useGigApprovalFlow(ARGS))
    await act(async () => {
      await result.current.apply('my pitch', 'ChosenWallet11')
    })
    expect(applyMock).toHaveBeenCalledWith(
      { id: 'e1' },
      { wallet_address: 'ChosenWallet11', message: 'my pitch' },
    )
  })

  test('cancelling the confirm acts on nothing', () => {
    const { result } = renderHook(() => useGigApprovalFlow(ARGS))
    act(() => result.current.handleAction('withdraw'))
    act(() => result.current.confirmDialog.onCancel())
    expect(result.current.confirmDialog.open).toBe(false)
    expect(withdrawMock).not.toHaveBeenCalled()
  })
})
