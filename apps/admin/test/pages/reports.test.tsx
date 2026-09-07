import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PaginatedResponse, Report } from '@tenda/shared'
import { renderPage } from '../test-utils'
import ReportsPage from '@/app/(dashboard)/reports/page'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { reports: { list: vi.fn(), action: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const list = vi.mocked(adminApi.reports.list)
const err = vi.mocked(toast.error)

const REPORT = {
  id: 'r1', reason: 'spam', note: 'buying followers', content_type: 'user',
  status: 'pending', created_at: new Date('2026-06-10T00:00:00.000Z'),
} as unknown as Report

function page(rows: Report[]): PaginatedResponse<Report> {
  return { data: rows, total: rows.length, limit: 20, offset: 0 }
}

beforeEach(() => vi.clearAllMocks())

test('renders report rows with reason, note and status badge', async () => {
  list.mockResolvedValue(page([REPORT]))
  renderPage(<ReportsPage />)
  expect(await screen.findByText('spam')).toBeInTheDocument()
  expect(screen.getByText('buying followers')).toBeInTheDocument()
  // 'pending' also names a tab — scope the status assertion to the row badge.
  const dataRow = screen.getByRole('row', { name: /spam/ })
  expect(within(dataRow).getByText('pending')).toBeInTheDocument()
})

test('the empty state shows when a tab has no reports', async () => {
  list.mockResolvedValue(page([]))
  renderPage(<ReportsPage />)
  expect(await screen.findByText('No reports here.')).toBeInTheDocument()
})

test('clicking Action opens the triage dialog for that report', async () => {
  list.mockResolvedValue(page([REPORT]))
  renderPage(<ReportsPage />)
  await screen.findByText('spam')
  await userEvent.click(screen.getByRole('button', { name: 'Action' }))
  expect(await screen.findByText('Action report')).toBeInTheDocument()
})

test('a failed load toasts an error', async () => {
  list.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'))
  renderPage(<ReportsPage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('boom'))
})
