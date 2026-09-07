/**
 * OfferSellTab — render gating + submit wiring for the manual-rate offer.
 * Verifies the Post CTA is disabled until valid, and that submitting passes the
 * computed fiat total + the default accept (7d/168h) and payment (12h) windows.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS, DEFAULT_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

const OPTION = { chainId: 'solana:devnet', assetId: 'USDC_SOL', symbol: 'USDC', decimals: 6, chainName: 'Solana', walletAddress: 'sol1' } as ExchangeAssetOption
let mockSelection = { options: [OPTION] as ExchangeAssetOption[], option: OPTION as ExchangeAssetOption | null, selectedKey: 'k', select: jest.fn() }
const NG_ACCOUNT = {
  id: 'acc1',
  country: 'NG',
  bank_code: '058',
  account_number_masked: '******4821',
  account_name: 'Ada',
}
// `let` so a test can hand the tab an account whose market no longer exists.
let mockAccount: typeof NG_ACCOUNT = NG_ACCOUNT
const mockSubmit = jest.fn()

jest.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: {
  surface: { inset: '#eee', background: '#fff' },
  content: { secondary: '#555' },
  border: { subtle: '#ddd' },
  feedback: { warning: { base: '#a60' } },
} } }) }))
jest.mock('../useAssetSelection', () => ({ useAssetSelection: () => mockSelection }))
jest.mock('@/hooks/usePayoutAccounts', () => ({ usePayoutAccounts: () => ({ accounts: [mockAccount], selectedId: 'acc1', selected: mockAccount, setSelectedId: jest.fn(), reload: jest.fn() }) }))
jest.mock('../useOfferSell', () => ({ useOfferSell: () => ({ submitting: false, submit: mockSubmit }) }))
jest.mock('../SellAssetAmount', () => {
  const { TextInput } = require('react-native')
  return { SellAssetAmount: ({ onAmountChange }: { onAmountChange: (t: string) => void }) => <TextInput accessibilityLabel="amount" onChangeText={onAmountChange} /> }
})
jest.mock('../OfferDeadlines', () => ({ OfferDeadlines: () => null }))
jest.mock('../SellPayoutSection', () => ({ SellPayoutSection: () => null }))
jest.mock('@/components/shared/FeeSummary', () => ({ FeeSummary: () => null }))
jest.mock('../OfferReviewCard', () => ({ OfferReviewCard: () => null }))
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return { Input: ({ onChangeText }: { onChangeText: (t: string) => void }) => <TextInput accessibilityLabel="rate" onChangeText={onChangeText} /> }
})
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Spacer: () => null,
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={disabled ? undefined : onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})

import { OfferSellTab } from '../OfferSellTab'

beforeEach(() => {
  mockSelection = { options: [OPTION], option: OPTION, selectedKey: 'k', select: jest.fn() }
  mockAccount = NG_ACCOUNT
  mockSubmit.mockReset()
})

test('Post is disabled until amount + rate are valid', () => {
  render(<OfferSellTab />)
  expect(screen.getByText('Enter an amount to post your offer')).toBeTruthy()
  const post = screen.getByText('Post offer')
  fireEvent.press(post) // no amount/rate yet
  expect(mockSubmit).not.toHaveBeenCalled()
})

test('shows the wallet guidance without a dead submit action when no asset is available', () => {
  mockSelection = { options: [], option: null, selectedKey: '', select: jest.fn() }
  render(<OfferSellTab />)

  expect(screen.queryByText('Post offer')).toBeNull()
  expect(screen.queryByText('Your rate')).toBeNull()
})

test('rejects an amount whose fiat calculation overflows', () => {
  render(<OfferSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '9'.repeat(309))
  fireEvent.changeText(screen.getByLabelText('rate'), '1600')

  expect(screen.getByText('Enter a smaller amount to post your offer')).toBeTruthy()
  fireEvent.press(screen.getByText('Post offer'))
  expect(mockSubmit).not.toHaveBeenCalled()
})

test('rejects a positive amount that rounds down to zero fiat', () => {
  render(<OfferSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '0.000001')
  fireEvent.changeText(screen.getByLabelText('rate'), '1')

  expect(screen.getByText('Enter a smaller amount to post your offer')).toBeTruthy()
  fireEvent.press(screen.getByText('Post offer'))
  expect(mockSubmit).not.toHaveBeenCalled()
})

test('submits with the computed fiat total and the default accept + payment windows', () => {
  render(<OfferSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '2')
  fireEvent.changeText(screen.getByLabelText('rate'), '1600')
  fireEvent.press(screen.getByText('Post offer'))

  expect(mockSubmit).toHaveBeenCalledWith({
    option: OPTION,
    amountRaw: '2000000', // 2 USDC @ 6dp
    account: NG_ACCOUNT,
    fiatTotal: 3200, // 2 * 1600
    currency: 'NGN',
    rate: 1600,
    acceptHours: DEFAULT_ACCEPT_WINDOW_SECONDS / 3600, // 168 (7d)
    paymentWindowSeconds: EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS, // 12h
  })
})

/**
 * A saved account whose country is no longer a payout market.
 *
 * Reachable by retiring a market — the spec is commented out of the registry
 * while someone still has an account saved for it. `payoutCurrencyForCountry`
 * then answers null, and the tab has to treat that as "no usable payout
 * account" rather than as a currency it can post in.
 *
 * The regression this guards: an earlier version left the CTA ENABLED and had
 * handleSubmit return silently on the null currency, so the button did nothing
 * at all — worse than a disabled one, because it gives no reason.
 */
test('an account in a retired market disables the CTA instead of deadening it', () => {
  mockAccount = { ...NG_ACCOUNT, country: 'ZW' } // never a payout market
  render(<OfferSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '2')
  fireEvent.changeText(screen.getByLabelText('rate'), '1600')

  expect(screen.getByText('Choose a payout account to post your offer')).toBeTruthy()
  fireEvent.press(screen.getByText('Post offer'))
  expect(mockSubmit).not.toHaveBeenCalled()
})

test('the rate label falls back when no currency is resolved', () => {
  mockAccount = { ...NG_ACCOUNT, country: 'ZW' }
  render(<OfferSellTab />)
  // "NGN per USDC" would be a currency this account cannot be paid in.
  expect(screen.queryByText(/NGN per/)).toBeNull()
})
