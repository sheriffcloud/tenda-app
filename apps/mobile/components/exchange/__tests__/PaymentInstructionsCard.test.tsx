/**
 * PaymentInstructionsCard — the accepted buyer's payment context (#5). Shows
 * the seller's FULL account, the exact fiat, and a reference, with rail-aware
 * labels and a status-aware heading.
 */
import { render, screen } from '@testing-library/react-native'
import type { ExchangePayoutAccount, ExchangeDetail, EscrowStatus, UserRef } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
      brand: { primary: '#00f' }, content: { primary: '#111', secondary: '#555', tertiary: '#999' },
      feedback: {
        warning: { base: '#c97', surface: '#fed', text: '#850', border: '#eca' },
        danger: { base: '#c33', surface: '#fdd', text: '#811', border: '#eaa' },
      },
    } },
  }),
}))
jest.mock('lucide-react-native', () => ({ Landmark: () => null, Smartphone: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { PaymentInstructionsCard, shouldShowPaymentInstructions } from '../PaymentInstructionsCard'

const bank: ExchangePayoutAccount = {
  kind: 'bank', bank_code: 'GTB', account_number: '0123456789', account_name: 'ADAEZE O', country: 'NG',
}
const momo: ExchangePayoutAccount = {
  kind: 'mobile_money', bank_code: 'MTN', account_number: '0803000000', account_name: 'KWAME', country: 'GH',
}

test('bank account: full number, amount, reference, and pay prompt', () => {
  render(<PaymentInstructionsCard account={bank} fiatDisplay="₦150,000" reference="ABCD1234" status="accepted" />)
  expect(screen.getByText('Pay the seller')).toBeTruthy()
  expect(screen.getByText('Bank')).toBeTruthy()
  expect(screen.getByText('Account number')).toBeTruthy()
  expect(screen.getByText('0123456789')).toBeTruthy() // FULL number, not masked
  expect(screen.getByText('ADAEZE O')).toBeTruthy()
  expect(screen.getByText('₦150,000')).toBeTruthy()
  expect(screen.getByText('ABCD1234')).toBeTruthy()
})

test('mobile money: rail-specific labels', () => {
  render(<PaymentInstructionsCard account={momo} fiatDisplay="₵1,200" reference="REF1" status="accepted" />)
  expect(screen.getByText('Network')).toBeTruthy()
  expect(screen.getByText('Phone number')).toBeTruthy()
  expect(screen.queryByText('Account number')).toBeNull()
})

test('submitted status flips the heading to "Payment sent"', () => {
  render(<PaymentInstructionsCard account={bank} fiatDisplay="₦150,000" reference="ABCD1234" status="submitted" />)
  expect(screen.getByText('Payment sent')).toBeTruthy()
  expect(screen.queryByText('Pay the seller')).toBeNull()
})

// ── live countdown banner ────────────────────────────────────────────────────

const CLOCK = /^\d+:\d{2}:\d{2}$/
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000)

test('accepted + deadline → "Pay within" a live H:MM:SS clock', () => {
  render(
    <PaymentInstructionsCard account={bank} fiatDisplay="₦150,000" reference="ABCD1234" status="accepted" deadline={inHours(5)} />,
  )
  expect(screen.getByText('Pay within')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('submitted + deadline → "Seller confirms within" a clock', () => {
  render(
    <PaymentInstructionsCard account={bank} fiatDisplay="₦150,000" reference="ABCD1234" status="submitted" deadline={inHours(10)} />,
  )
  expect(screen.getByText('Seller confirms within')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('no deadline → no countdown banner', () => {
  render(<PaymentInstructionsCard account={bank} fiatDisplay="₦150,000" reference="ABCD1234" status="accepted" />)
  expect(screen.queryByText('Pay within')).toBeNull()
  expect(screen.queryByText(CLOCK)).toBeNull()
})

// ── visibility gate ──────────────────────────────────────────────────────────

const buyer: UserRef = {
  id: 'buyer', first_name: 'B', last_name: 'Y', avatar_url: null, review_score: '0', is_seeker: false, is_agent: false, country: 'NG',
}

function gateOffer(
  status: EscrowStatus,
  over: Partial<Pick<ExchangeDetail, 'counterparty' | 'payout_account'>> = {},
): Pick<ExchangeDetail, 'counterparty' | 'payout_account' | 'status'> {
  return { status, counterparty: buyer, payout_account: bank, ...over }
}

test('gate: shown to the accepted buyer at accepted / submitted', () => {
  expect(shouldShowPaymentInstructions(gateOffer('accepted'), 'buyer')).toBe(true)
  expect(shouldShowPaymentInstructions(gateOffer('submitted'), 'buyer')).toBe(true)
})

test('gate: NEVER shown once disputed (payment is moot; would mislead)', () => {
  expect(shouldShowPaymentInstructions(gateOffer('disputed'), 'buyer')).toBe(false)
})

test('gate: not shown to the seller, nor when no account is linked', () => {
  expect(shouldShowPaymentInstructions(gateOffer('accepted'), 'someone-else')).toBe(false)
  expect(shouldShowPaymentInstructions(gateOffer('accepted', { payout_account: null }), 'buyer')).toBe(false)
})

test('gate: not shown at terminal / pre-accept statuses', () => {
  for (const status of ['open', 'completed', 'resolved', 'cancelled'] as EscrowStatus[]) {
    expect(shouldShowPaymentInstructions(gateOffer(status), 'buyer')).toBe(false)
  }
})
