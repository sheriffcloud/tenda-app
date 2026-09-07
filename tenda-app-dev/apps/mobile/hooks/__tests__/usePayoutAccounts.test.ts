/**
 * usePayoutAccounts — focus-refresh loader for payout accounts. Pins the two
 * behaviours the sell / create-offer flows depend on:
 *  - refetch on FOCUS (an account added elsewhere appears on return), and
 *  - selection SURVIVES a refetch when the account still exists, else falls
 *    back to the default/first (so a deletion can't leave a dangling id).
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'

const mockBankAccounts = jest.fn()
jest.mock('@/api/client', () => ({ api: { fiat: { bankAccounts: () => mockBankAccounts() } } }))

// Capture the focus callback so the test can re-fire it (simulate refocus).
let focusCb: (() => void) | null = null
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { focusCb = cb },
}))

import { usePayoutAccounts } from '@/hooks/usePayoutAccounts'

function acc(id: string, is_default = false): BankAccountSummary {
  return {
    id, country: 'NG', kind: 'bank', bank_code: '058',
    account_number_masked: '•••• 0000', account_name: id.toUpperCase(),
    is_default, verified: false, created_at: '',
  }
}

async function focus() {
  await act(async () => { focusCb?.() })
}

beforeEach(() => {
  mockBankAccounts.mockReset()
  focusCb = null
})

test('first focus loads accounts and auto-selects the default', async () => {
  mockBankAccounts.mockResolvedValue([acc('a'), acc('b', true)])
  const { result } = renderHook(() => usePayoutAccounts())
  await focus()
  await waitFor(() => expect(result.current.accounts).toHaveLength(2))
  expect(result.current.selectedId).toBe('b')
  expect(result.current.selected?.id).toBe('b')
})

test('a refetch that adds an account preserves the current selection', async () => {
  mockBankAccounts.mockResolvedValueOnce([acc('a', true)])
  const { result } = renderHook(() => usePayoutAccounts())
  await focus()
  await waitFor(() => expect(result.current.selectedId).toBe('a'))

  act(() => result.current.setSelectedId('a'))
  mockBankAccounts.mockResolvedValueOnce([acc('a', true), acc('c')])
  await focus()
  await waitFor(() => expect(result.current.accounts).toHaveLength(2))
  expect(result.current.selectedId).toBe('a') // preserved, not reset to default
})

test('when the selected account disappears, selection falls back to default', async () => {
  mockBankAccounts.mockResolvedValueOnce([acc('a', true), acc('b')])
  const { result } = renderHook(() => usePayoutAccounts())
  await focus()
  await waitFor(() => expect(result.current.accounts).toHaveLength(2))
  act(() => result.current.setSelectedId('b'))

  mockBankAccounts.mockResolvedValueOnce([acc('a', true)]) // 'b' removed
  await focus()
  await waitFor(() => expect(result.current.selectedId).toBe('a'))
})

test('a load failure yields an empty list, not a crash', async () => {
  mockBankAccounts.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => usePayoutAccounts())
  await focus()
  await waitFor(() => expect(result.current.accounts).toEqual([]))
  expect(result.current.selectedId).toBeNull()
})
