import { test, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import type { PaginatedResponse, ResolutionQueueRow } from '@tenda/shared'
import { renderPage } from '../test-utils'
import ResolutionsPage from '@/app/(dashboard)/resolutions/page'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: { resolutions: { queue: vi.fn() } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const queue = vi.mocked(adminApi.resolutions.queue)

function row(over: Partial<ResolutionQueueRow> = {}): ResolutionQueueRow {
  return {
    id: 'r1', dispute_id: 'd1', escrow_id: 'e1', kind: 'gig', subject_title: 'Fix my sink',
    proposed_winner: 'creator', proposed_by: 'm1', status: 'pending', threshold: 1,
    reject_reason: null, rejected_by: null, resolved_tx_ref: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z', ...over,
  }
}
const paginated = (rows: ResolutionQueueRow[]): PaginatedResponse<ResolutionQueueRow> => ({
  data: rows, total: rows.length, limit: 20, offset: 0,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

test('renders the pending queue with rows', async () => {
  queue.mockResolvedValue(paginated([row()]))
  renderPage(<ResolutionsPage />)
  expect(await screen.findByRole('heading', { name: 'Resolutions' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Fix my sink' })).toHaveAttribute('href', '/disputes/d1')
  expect(queue).toHaveBeenCalledWith({ status: 'pending', limit: 20, offset: 0 })
})

test('empty queue shows the empty state', async () => {
  queue.mockResolvedValue(paginated([]))
  renderPage(<ResolutionsPage />)
  expect(await screen.findByText('No proposals awaiting signature.')).toBeInTheDocument()
})

test('a load failure toasts an error', async () => {
  queue.mockRejectedValue(new ApiError(500, 'X', 'down'))
  renderPage(<ResolutionsPage />)
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('down'))
})
