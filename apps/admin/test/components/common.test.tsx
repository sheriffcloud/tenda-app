import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EscrowStatusBadge, UserStatusBadge } from '@/components/common/status-badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListPagination } from '@/components/common/list-pagination'

test('EscrowStatusBadge: positive states render the default variant', () => {
  const { container } = render(<EscrowStatusBadge status="completed" />)
  expect(screen.getByText('completed')).toBeInTheDocument()
  expect(container.querySelector('[data-slot="badge"]')).toBeTruthy()
})

test('EscrowStatusBadge: terminal-negative states (disputed/cancelled/refunded) use destructive', () => {
  for (const status of ['disputed', 'cancelled', 'refunded'] as const) {
    const { unmount } = render(<EscrowStatusBadge status={status} />)
    expect(screen.getByText(status)).toBeInTheDocument()
    unmount()
  }
})

test('EscrowStatusBadge: in-flight states (open/accepted/submitted) use outline', () => {
  render(<EscrowStatusBadge status="open" />)
  expect(screen.getByText('open')).toBeInTheDocument()
})

test('UserStatusBadge: active vs suspended both render their label', () => {
  const { unmount } = render(<UserStatusBadge status="active" />)
  expect(screen.getByText('active')).toBeInTheDocument()
  unmount()
  render(<UserStatusBadge status="suspended" />)
  expect(screen.getByText('suspended')).toBeInTheDocument()
})

test('ConfirmDialog: hidden when closed, shows title/description when open', () => {
  const { rerender } = render(
    <ConfirmDialog open={false} onOpenChange={() => {}} title="Delete?" description="Permanent." onConfirm={() => {}} />,
  )
  expect(screen.queryByText('Delete?')).toBeNull()
  rerender(
    <ConfirmDialog open onOpenChange={() => {}} title="Delete?" description="Permanent." onConfirm={() => {}} />,
  )
  expect(screen.getByText('Delete?')).toBeInTheDocument()
  expect(screen.getByText('Permanent.')).toBeInTheDocument()
})

test('ConfirmDialog: confirm + cancel fire their callbacks; default label is "Confirm"', async () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ConfirmDialog open onOpenChange={onOpenChange} title="t" description="d" onConfirm={onConfirm} />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(onConfirm).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('ConfirmDialog: loading disables confirm and swaps the label', () => {
  render(
    <ConfirmDialog open onOpenChange={() => {}} title="t" description="d" confirmLabel="Suspend" loading onConfirm={() => {}} />,
  )
  const btn = screen.getByRole('button', { name: 'Saving…' })
  expect(btn).toBeDisabled()
})

test('ListPagination: renders nothing for a single page', () => {
  const { container } = render(<ListPagination page={1} totalPages={1} onPageChange={() => {}} />)
  expect(container.firstChild).toBeNull()
})

test('ListPagination: prev/next call onPageChange within bounds and no-op at the edges', async () => {
  const onPageChange = vi.fn()
  const { rerender } = render(<ListPagination page={1} totalPages={3} onPageChange={onPageChange} />)
  // page 1: prev is a no-op, next advances.
  await userEvent.click(screen.getByText('Previous'))
  expect(onPageChange).not.toHaveBeenCalled()
  await userEvent.click(screen.getByText('Next'))
  expect(onPageChange).toHaveBeenCalledWith(2)

  onPageChange.mockClear()
  rerender(<ListPagination page={3} totalPages={3} onPageChange={onPageChange} />)
  // page 3 (last): next is a no-op, prev goes back.
  await userEvent.click(screen.getByText('Next'))
  expect(onPageChange).not.toHaveBeenCalled()
  await userEvent.click(screen.getByText('Previous'))
  expect(onPageChange).toHaveBeenCalledWith(2)
})
