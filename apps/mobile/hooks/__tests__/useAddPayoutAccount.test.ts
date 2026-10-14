/**
 * useAddPayoutAccount — the shared add-payout-account orchestration. Verifies
 * the country default (home country when supported, else the first market),
 * spec lookup, and the create call (first-account default flag, success return,
 * error → null + toast).
 */
import { renderHook, act } from '@testing-library/react-native'
import { SUPPORTED_PAYOUT_COUNTRIES, type BankAccountSummary } from '@tenda/shared'

let mockCountry: string | null = 'NG'
const mockCreate = jest.fn<Promise<BankAccountSummary>, [unknown]>()
const mockToast = jest.fn()

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { country: mockCountry } }),
}))
jest.mock('@/api/client', () => ({
  api: { fiat: { createBankAccount: (b: unknown) => mockCreate(b) } },
  ApiClientError: class ApiClientError extends Error {
    constructor(_status: number, _error: string, message: string) { super(message) }
  },
}))
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))

import { ApiClientError } from '@tenda/shared'
import { useAddPayoutAccount, defaultPayoutCountry } from '@/hooks/useAddPayoutAccount'

const VALUE = { kind: 'bank' as const, bank_code: ' 058 ', account_number: ' 0123456789 ', account_name: ' Ada Lovelace ' }

function account(): BankAccountSummary {
  return {
    id: 'ba1', country: 'NG', kind: 'bank', bank_code: '058',
    account_number_masked: '•••• 6789', account_name: 'ADA LOVELACE',
    is_default: true, verified: false, created_at: '',
  }
}

beforeEach(() => {
  mockCountry = 'NG'
  mockCreate.mockReset()
  mockToast.mockReset()
})

test('defaultPayoutCountry: supported home country is kept, else falls back to first market', () => {
  expect(defaultPayoutCountry('NG')).toBe('NG')
  expect(defaultPayoutCountry('US')).toBe(SUPPORTED_PAYOUT_COUNTRIES[0])
  expect(defaultPayoutCountry(null)).toBe(SUPPORTED_PAYOUT_COUNTRIES[0])
})

test('defaults country to the supported home country and resolves its spec', () => {
  const { result } = renderHook(() => useAddPayoutAccount(true))
  expect(result.current.country).toBe('NG')
  expect(result.current.spec).not.toBeNull()
})

test('save trims fields, marks the FIRST account default, returns the account + success toast', async () => {
  mockCreate.mockResolvedValue(account())
  const { result } = renderHook(() => useAddPayoutAccount(true))

  let returned: BankAccountSummary | null = null
  await act(async () => { returned = await result.current.save(VALUE) })

  expect(mockCreate).toHaveBeenCalledWith({
    country: 'NG', kind: 'bank', bank_code: '058', account_number: '0123456789',
    account_name: 'Ada Lovelace', is_default: true,
  })
  expect(returned).toEqual(account())
  expect(mockToast).toHaveBeenCalledWith('success', expect.any(String))
})

test('a non-first account is not marked default', async () => {
  mockCreate.mockResolvedValue(account())
  const { result } = renderHook(() => useAddPayoutAccount(false))
  await act(async () => { await result.current.save(VALUE) })
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ is_default: false }))
})

test('save failure returns null and shows the API error message', async () => {
  mockCreate.mockRejectedValue(new ApiClientError(409, 'Conflict', 'bank account already saved'))
  const { result } = renderHook(() => useAddPayoutAccount(true))

  let returned: BankAccountSummary | null = account()
  await act(async () => { returned = await result.current.save(VALUE) })

  expect(returned).toBeNull()
  expect(mockToast).toHaveBeenCalledWith('error', 'bank account already saved')
})
