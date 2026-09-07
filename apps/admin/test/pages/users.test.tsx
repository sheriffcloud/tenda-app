import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { PaginatedResponse } from '@tenda/shared'
import { renderPage } from '../test-utils'
import UsersPage from '@/app/(dashboard)/users/page'
import { adminApi, type AdminUserListRow } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { adminUsers: { list: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const list = vi.mocked(adminApi.adminUsers.list)
const err = vi.mocked(toast.error)

function row(over: Partial<AdminUserListRow> = {}): AdminUserListRow {
  return {
    id: 'u1', first_name: 'Ada', last_name: 'Lovelace', role: 'user', status: 'active',
    is_seeker: false, country: 'NG', city: 'Lagos', review_score: '4.50',
    created_at: '2026-01-01T00:00:00.000Z', last_active_at: null, ...over,
  }
}
function page(rows: AdminUserListRow[]): PaginatedResponse<AdminUserListRow> {
  return { data: rows, total: rows.length, limit: 20, offset: 0 }
}

beforeEach(() => vi.clearAllMocks())

test('renders user rows with a link to the detail page', async () => {
  list.mockResolvedValue(page([row()]))
  renderPage(<UsersPage />)
  const link = await screen.findByRole('link', { name: 'Ada Lovelace' })
  expect(link).toHaveAttribute('href', '/users/u1')
  expect(screen.getByText('Lagos, NG')).toBeInTheDocument()
  expect(screen.getByText('4.50')).toBeInTheDocument()
})

test('shows the empty state when no users match', async () => {
  list.mockResolvedValue(page([]))
  renderPage(<UsersPage />)
  expect(await screen.findByText('No users match.')).toBeInTheDocument()
})

test('a failed load toasts an error', async () => {
  list.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'load fail'))
  renderPage(<UsersPage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('load fail'))
})
