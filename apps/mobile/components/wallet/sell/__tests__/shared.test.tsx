/**
 * sell/shared — QuoteSummary + QuoteLoading + QuoteError + UnavailableNotice.
 * Covers the fee (Free vs amount) and expiry (valid countdown vs expired +
 * refresh action) branches, the loading/error cards, and the notice.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { surface: { card: '#fff', inset: '#eee' }, border: { default: '#ddd' }, content: { secondary: '#555', tertiary: '#999' }, feedback: { danger: { base: '#c00', surface: '#fee', text: '#900', border: '#fcc' } } } } }),
}))
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}><Text>{children}</Text></Pressable>
    ),
  }
})
jest.mock('@/theme/tokens', () => ({ spacing: { md: 16 } }))

import { QuoteSummary, QuoteLoading, QuoteError, UnavailableNotice } from '../shared'

test('QuoteSummary shows a fee amount and a live countdown when valid', () => {
  render(<QuoteSummary rate={1600} fee={50} fiatAmount={16000} currencySymbol="₦" assetSymbol="USDC" expiresIn={125} />)
  expect(screen.getByText('₦1,600 / USDC')).toBeTruthy() // rate row
  expect(screen.getByText('₦50')).toBeTruthy() // fee row (non-zero → amount, not "Free")
  expect(screen.getByText('₦16,000')).toBeTruthy() // you receive
  expect(screen.getByText('Quote valid for 2:05')).toBeTruthy()
  expect(screen.queryByText('Refresh quote')).toBeNull() // no refresh while valid
})

test('QuoteSummary shows "Free" and the refresh action on a zero fee / lapsed quote', () => {
  const onRefresh = jest.fn()
  render(<QuoteSummary rate={1600} fee={0} fiatAmount={16000} currencySymbol="₦" assetSymbol="USDC" expiresIn={0} onRefresh={onRefresh} />)
  expect(screen.getByText('Free')).toBeTruthy()
  expect(screen.getByText('This quote has expired')).toBeTruthy()
  fireEvent.press(screen.getByText('Refresh quote'))
  expect(onRefresh).toHaveBeenCalled()
})

test('QuoteSummary hides the refresh action when expired without a handler', () => {
  render(<QuoteSummary rate={1600} fee={0} fiatAmount={16000} currencySymbol="₦" assetSymbol="USDC" expiresIn={0} />)
  expect(screen.getByText('This quote has expired')).toBeTruthy()
  expect(screen.queryByText('Refresh quote')).toBeNull()
})

test('QuoteLoading renders the fetching copy', () => {
  render(<QuoteLoading />)
  expect(screen.getByText('Fetching your quote…')).toBeTruthy()
})

test('QuoteError renders the failure copy and fires the retry action', () => {
  const onRetry = jest.fn()
  render(<QuoteError onRetry={onRetry} />)
  // Typographic apostrophe, matching the copy — the straight `'` is an eslint
  // error in JSX text (react/no-unescaped-entities) and the sibling
  // QuoteLoading assertion pins its `…` the same exact way.
  expect(screen.getByText(/couldn’t fetch a quote/i)).toBeTruthy()
  fireEvent.press(screen.getByText('Retry'))
  expect(onRetry).toHaveBeenCalled()
})

test('UnavailableNotice renders its copy', () => {
  render(<UnavailableNotice copy="No route available." />)
  expect(screen.getByText('No route available.')).toBeTruthy()
})
