import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { FinanceFeesResponse } from '@tenda/shared'
import { renderPage } from '../test-utils'
import FinancePage from '@/app/(dashboard)/finance/page'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { finance: { fees: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const fees = vi.mocked(adminApi.finance.fees)
const err = vi.mocked(toast.error)

const RESPONSE: FinanceFeesResponse = {
  period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' },
  grand_total_fee_raw: '123456789',
  by_kind: {
    gig: { total_fee_raw: '999', by_type: [{ type: 'approve', transaction_count: 3, total_platform_fee: '999', total_amount: '40000' }] },
    exchange: { total_fee_raw: '0', by_type: [] },
  },
}

beforeEach(() => vi.clearAllMocks())

test('renders the grand total and a populated gig fee table', async () => {
  fees.mockResolvedValue(RESPONSE)
  renderPage(<FinancePage />)
  expect(await screen.findByText('123456789')).toBeInTheDocument()
  expect(screen.getByText('approve')).toBeInTheDocument()
  expect(screen.getByText('999')).toBeInTheDocument()
})

test('shows the no-transactions copy for an empty kind', async () => {
  fees.mockResolvedValue(RESPONSE)
  renderPage(<FinancePage />)
  // exchange has no rows.
  expect(await screen.findByText('No transactions in range.')).toBeInTheDocument()
})

test('a failed load toasts an error', async () => {
  fees.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'fees fail'))
  renderPage(<FinancePage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('fees fail'))
})
