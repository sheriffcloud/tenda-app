import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Report } from '@tenda/shared'
import { ReportActionDialog } from '@/components/reports/action-dialog'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { reports: { action: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const action = vi.mocked(adminApi.reports.action)
const ok = vi.mocked(toast.success)
const err = vi.mocked(toast.error)

const REPORT = { id: 'r1', reason: 'spam' } as Report

beforeEach(() => {
  vi.clearAllMocks()
})

test('closed when report is null', () => {
  render(<ReportActionDialog report={null} onClose={() => {}} onActioned={() => {}} />)
  expect(screen.queryByText('Action report')).toBeNull()
})

test('open shows the dialog with the report reason', () => {
  render(<ReportActionDialog report={REPORT} onClose={() => {}} onActioned={() => {}} />)
  expect(screen.getByText('Action report')).toBeInTheDocument()
  expect(screen.getByText(/spam/)).toBeInTheDocument()
})

test('submit with no note omits admin_note, toasts, then closes + refetches', async () => {
  action.mockResolvedValueOnce(REPORT)
  const onClose = vi.fn()
  const onActioned = vi.fn()
  render(<ReportActionDialog report={REPORT} onClose={onClose} onActioned={onActioned} />)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(action).toHaveBeenCalledWith('r1', { status: 'reviewed' }))
  expect(ok).toHaveBeenCalledWith('Report marked reviewed')
  expect(onActioned).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalled()
})

test('a typed note is trimmed and included as admin_note', async () => {
  action.mockResolvedValueOnce(REPORT)
  render(<ReportActionDialog report={REPORT} onClose={() => {}} onActioned={() => {}} />)
  await userEvent.type(screen.getByPlaceholderText('Admin note (optional)'), '  spammy  ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith('r1', { status: 'reviewed', admin_note: 'spammy' }),
  )
})

test('a failed action surfaces the error toast and keeps the dialog open', async () => {
  action.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'nope'))
  const onClose = vi.fn()
  render(<ReportActionDialog report={REPORT} onClose={onClose} onActioned={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('nope'))
  expect(onClose).not.toHaveBeenCalled()
})
