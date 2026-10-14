import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

const createBankAccount = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { fiat: { createBankAccount } } }))

import { PayoutAccountForm } from '@/components/payout/PayoutAccountForm'

const row = {
  id: 'bank-1', country: 'NG', kind: 'bank', bank_code: '058',
  account_number_masked: '•• 1234', account_name: 'Ada', is_default: false,
  verified: true, created_at: '2026-08-23T00:00:00.000Z',
}

beforeEach(() => createBankAccount.mockResolvedValue(row))

it('rejects incomplete details before making a request', async () => {
  render(<PayoutAccountForm onCreated={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
  expect(createBankAccount).not.toHaveBeenCalled()
})

it('creates the spec-validated account and returns the server row', async () => {
  const onCreated = vi.fn()
  render(<PayoutAccountForm onCreated={onCreated} />)
  await userEvent.type(screen.getByLabelText('Bank (NIP) code'), '058')
  await userEvent.type(screen.getByLabelText('Account number'), '0123456789')
  await userEvent.type(screen.getByLabelText('Account name'), 'Ada')
  await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
  expect(createBankAccount).toHaveBeenCalledWith({ country: 'NG', kind: 'bank', bank_code: '058', account_number: '0123456789', account_name: 'Ada' })
  expect(onCreated).toHaveBeenCalledWith(row)
})
