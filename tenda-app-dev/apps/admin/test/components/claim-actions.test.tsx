import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClaimActions } from '@/components/disputes/claim-actions'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({
  adminApi: { disputes: { claim: vi.fn(), release: vi.fn() } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const claim = vi.mocked(adminApi.disputes.claim)
const release = vi.mocked(adminApi.disputes.release)
const ok = vi.mocked(toast.success)
const err = vi.mocked(toast.error)

beforeEach(() => {
  vi.clearAllMocks()
})

test('resolved disputes render no actions', () => {
  const { container } = render(
    <ClaimActions disputeId="d1" assignedToId={null} resolved meId="me" onChanged={() => {}} />,
  )
  expect(container.firstChild).toBeNull()
})

test('unclaimed: shows Claim, calls claim, toasts success, refetches', async () => {
  claim.mockResolvedValueOnce({ id: 'd1', assigned_to_id: 'me' })
  const onChanged = vi.fn()
  render(<ClaimActions disputeId="d1" assignedToId={null} resolved={false} meId="me" onChanged={onChanged} />)
  await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(claim).toHaveBeenCalledWith('d1'))
  expect(ok).toHaveBeenCalledWith('Dispute claimed')
  expect(onChanged).toHaveBeenCalled()
})

test('claimed by someone else: button reads Claimed and is disabled', () => {
  render(<ClaimActions disputeId="d1" assignedToId="other" resolved={false} meId="me" onChanged={() => {}} />)
  const btn = screen.getByRole('button', { name: 'Claimed' })
  expect(btn).toBeDisabled()
})

test('claimed by me: shows Release and calls release', async () => {
  release.mockResolvedValueOnce({ id: 'd1', assigned_to_id: null })
  render(<ClaimActions disputeId="d1" assignedToId="me" resolved={false} meId="me" onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Release' }))
  await waitFor(() => expect(release).toHaveBeenCalledWith('d1'))
  expect(ok).toHaveBeenCalledWith('Returned to the pool')
})

test('claim race (DISPUTE_ALREADY_CLAIMED) shows the lost-race toast', async () => {
  claim.mockRejectedValueOnce(new ApiError(409, 'DISPUTE_ALREADY_CLAIMED', 'x'))
  render(<ClaimActions disputeId="d1" assignedToId={null} resolved={false} meId="me" onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('Another mediator claimed this dispute first'))
})

test('already-resolved race (DISPUTE_RESOLVED) shows its specific toast', async () => {
  claim.mockRejectedValueOnce(new ApiError(409, 'DISPUTE_RESOLVED', 'x'))
  render(<ClaimActions disputeId="d1" assignedToId={null} resolved={false} meId="me" onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('Dispute is already resolved'))
})

test('unknown errors fall back to the error message', async () => {
  claim.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'))
  render(<ClaimActions disputeId="d1" assignedToId={null} resolved={false} meId="me" onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('boom'))
})

test('non-ApiError rejection uses the generic Action failed copy', async () => {
  claim.mockRejectedValueOnce(new Error('network'))
  render(<ClaimActions disputeId="d1" assignedToId={null} resolved={false} meId="me" onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('Action failed'))
})
