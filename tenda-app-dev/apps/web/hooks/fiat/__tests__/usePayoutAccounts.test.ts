/**
 * The payout-account list and its selection.
 *
 * Two rules, both of which were bugs somewhere first: `null` while loading is
 * NOT `[]`, because "add a payout account" shown to someone who has three is a
 * lie with a button on it; and a selection survives a reload while its account
 * still exists, so deleting a different one cannot leave the surface pointing
 * at nothing.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankAccountSummary } from '@tenda/shared'
import { usePayoutAccounts } from '@/hooks/fiat/usePayoutAccounts'

const bankAccounts = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { fiat: { bankAccounts } } }))

const acct = (over: Partial<BankAccountSummary> = {}): BankAccountSummary => ({
  id: 'acc-1',
  country: 'NG',
  kind: 'bank',
  bank_code: '058',
  account_number_masked: '••••6789',
  account_name: 'Ada Okafor',
  is_default: false,
  verified: true,
  created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  bankAccounts.mockReset()
})

describe('usePayoutAccounts', () => {
  it('is NULL while loading — never an empty list someone would act on', () => {
    bankAccounts.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePayoutAccounts())
    expect(result.current.accounts).toBeNull()
    expect(result.current.selected).toBeNull()
  })

  it('selects the DEFAULT account, not merely the first row', async () => {
    bankAccounts.mockResolvedValue([acct({ id: 'a' }), acct({ id: 'b', is_default: true })])
    const { result } = renderHook(() => usePayoutAccounts())
    await waitFor(() => expect(result.current.selected?.id).toBe('b'))
  })

  it('falls back to the first row when nothing is marked default', async () => {
    bankAccounts.mockResolvedValue([acct({ id: 'a' }), acct({ id: 'b' })])
    const { result } = renderHook(() => usePayoutAccounts())
    await waitFor(() => expect(result.current.selected?.id).toBe('a'))
  })

  it('KEEPS a chosen account across a reload', async () => {
    bankAccounts.mockResolvedValue([acct({ id: 'a', is_default: true }), acct({ id: 'b' })])
    const { result } = renderHook(() => usePayoutAccounts())
    await waitFor(() => expect(result.current.selected?.id).toBe('a'))

    act(() => result.current.setSelectedId('b'))
    await waitFor(() => expect(result.current.selected?.id).toBe('b'))

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    expect(result.current.selected?.id).toBe('b')
  })

  it('re-picks when the chosen account is GONE, rather than pointing at nothing', async () => {
    bankAccounts.mockResolvedValueOnce([acct({ id: 'a' }), acct({ id: 'b' })])
    const { result } = renderHook(() => usePayoutAccounts())
    await waitFor(() => expect(result.current.selected?.id).toBe('a'))
    act(() => result.current.setSelectedId('b'))
    await waitFor(() => expect(result.current.selected?.id).toBe('b'))

    // 'b' deleted elsewhere.
    bankAccounts.mockResolvedValueOnce([acct({ id: 'a' })])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.selected?.id).toBe('a'))
  })

  it('answers an EMPTY list on a failed read, so the surface can offer "add one"', async () => {
    bankAccounts.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => usePayoutAccounts())
    await waitFor(() => expect(result.current.accounts).toEqual([]))
    expect(result.current.selected).toBeNull()
  })
})
