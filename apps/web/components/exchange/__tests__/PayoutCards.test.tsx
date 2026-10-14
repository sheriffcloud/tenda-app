/**
 * The unit-tested payout visibility gates: instructions go to the
 * accepted BUYER at a live payment stage only (never in dispute — the
 * account PII must not keep circulating), the bound account goes to the
 * SELLER, and never both to one viewer.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import {
  PaymentInstructionsCard,
  shouldShowPaymentInstructions,
  shouldShowSellerPayout,
} from '@/components/exchange/PayoutCards'
import { makeExchangeDetail, makePayoutAccount, makeUserRef } from '../../../test/factories/exchange'

const account = makePayoutAccount()

test('payment instructions: accepted/submitted buyer only, never in dispute', () => {
  const base = makeExchangeDetail({
    counterparty: makeUserRef({ id: 'buyer-1' }),
    payout_account: account,
  })
  expect(shouldShowPaymentInstructions({ ...base, status: 'accepted' }, 'buyer-1')).toBe(true)
  expect(shouldShowPaymentInstructions({ ...base, status: 'submitted' }, 'buyer-1')).toBe(true)
  expect(shouldShowPaymentInstructions({ ...base, status: 'disputed' }, 'buyer-1')).toBe(false)
  expect(shouldShowPaymentInstructions({ ...base, status: 'accepted' }, 'seller-1')).toBe(false)
  expect(shouldShowPaymentInstructions({ ...base, status: 'accepted', payout_account: null }, 'buyer-1')).toBe(false)
})

test('seller payout: creator only, through the live stages, gone once settled', () => {
  const base = makeExchangeDetail({ payout_account: account })
  for (const status of ['draft', 'open', 'accepted', 'submitted'] as const) {
    expect(shouldShowSellerPayout({ ...base, status }, 'seller-1')).toBe(true)
  }
  expect(shouldShowSellerPayout({ ...base, status: 'completed' }, 'seller-1')).toBe(false)
  expect(shouldShowSellerPayout({ ...base, status: 'open' }, 'buyer-1')).toBe(false)
})

test('never both at once for the same viewer', () => {
  const live = makeExchangeDetail({
    status: 'accepted',
    counterparty: makeUserRef({ id: 'buyer-1' }),
    payout_account: account,
  })
  for (const viewer of ['seller-1', 'buyer-1', 'stranger']) {
    const both =
      shouldShowPaymentInstructions(live, viewer) && shouldShowSellerPayout(live, viewer)
    expect(both).toBe(false)
  }
})

test('every account fact the buyer must transcribe has a copy button carrying the RAW value', async () => {
  // The transfer happens off-platform where nothing can catch a typo (#48).
  const user = userEvent.setup()
  render(
    <PaymentInstructionsCard
      account={account}
      fiatDisplay="₦75,000"
      reference="ABCD1234"
      status="accepted"
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Copy account number' }))
  expect(await window.navigator.clipboard.readText()).toBe(account.account_number)
  await user.click(screen.getByRole('button', { name: 'Copy account name' }))
  expect(await window.navigator.clipboard.readText()).toBe(account.account_name)
  await user.click(screen.getByRole('button', { name: 'Copy reference' }))
  expect(await window.navigator.clipboard.readText()).toBe('ABCD1234')
})

test('a mobile-money account names its number for what it is', () => {
  render(
    <PaymentInstructionsCard
      account={{ ...account, kind: 'mobile_money' }}
      fiatDisplay="₦75,000"
      reference="ABCD1234"
      status="accepted"
    />,
  )
  expect(screen.getByRole('button', { name: 'Copy phone number' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy account number' })).toBeNull()
})
