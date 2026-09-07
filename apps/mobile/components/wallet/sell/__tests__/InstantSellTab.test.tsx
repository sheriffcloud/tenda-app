/**
 * InstantSellTab — render gating for the market-rate cash-out. Verifies the
 * no-wallet collapse, the unavailable-route notice, and that a valid
 * amount + account + fresh quote surfaces the CTA and fires confirm().
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

const OPTION = { chainId: 'solana:devnet', assetId: 'USDC_SOL', symbol: 'USDC', decimals: 6, chainName: 'Solana', walletAddress: 'sol1' } as ExchangeAssetOption
let mockSelection = { options: [OPTION] as ExchangeAssetOption[], option: OPTION as ExchangeAssetOption | null, selectedKey: 'k', select: jest.fn() }
let mockAccount: { id: string; country: string } | null = { id: 'acc1', country: 'NG' }
const mockConfirm = jest.fn()
const mockRefetch = jest.fn()
let mockInstant = { quote: { rate: 1600, fee_amount: 0, fiat_amount: 16000, provider: 'yellowcard' } as unknown, expiresIn: 300, loading: false, error: null as string | null, refetch: mockRefetch, currency: 'NGN', currencySymbol: '₦', submitting: false, confirm: mockConfirm }

jest.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: { content: { tertiary: '#999' }, feedback: { danger: { base: '#f00' } } } } }) }))
jest.mock('../useAssetSelection', () => ({ useAssetSelection: () => mockSelection }))
jest.mock('@/hooks/usePayoutAccounts', () => ({ usePayoutAccounts: () => ({ accounts: [mockAccount], selectedId: 'acc1', selected: mockAccount, setSelectedId: jest.fn(), reload: jest.fn() }) }))
jest.mock('../useInstantSell', () => ({ useInstantSell: () => mockInstant }))
jest.mock('../SellAssetAmount', () => {
  const { TextInput, Text } = require('react-native')
  return { SellAssetAmount: ({ onAmountChange, noWalletMessage, selection }: { onAmountChange: (t: string) => void; noWalletMessage: string; selection: { options: unknown[] } }) =>
    selection.options.length === 0 ? <Text>{`NOTICE:${noWalletMessage}`}</Text> : <TextInput accessibilityLabel="amount" onChangeText={onAmountChange} /> }
})
jest.mock('../SellPayoutSection', () => {
  const { Text } = require('react-native')
  return { SellPayoutSection: () => <Text>PAYOUT</Text> }
})
jest.mock('../shared', () => {
  const { Text, Pressable } = require('react-native')
  return {
    tabBodyStyle: {},
    QuoteSummary: () => <Text>QUOTE</Text>,
    QuoteLoading: () => <Text>LOADING</Text>,
    QuoteError: ({ onRetry }: { onRetry: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onRetry}><Text>RETRY</Text></Pressable>
    ),
    UnavailableNotice: ({ copy }: { copy: string }) => <Text>{copy}</Text>,
  }
})
jest.mock('@/components/shared/FeeSummary', () => {
  const { Text } = require('react-native')
  return { FeeSummary: () => <Text>FEE</Text> }
})
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}><Text>{children}</Text></Pressable>
    ),
  }
})

import { InstantSellTab } from '../InstantSellTab'

beforeEach(() => {
  mockSelection = { options: [OPTION], option: OPTION, selectedKey: 'k', select: jest.fn() }
  mockAccount = { id: 'acc1', country: 'NG' }
  mockInstant = { quote: { rate: 1600, fee_amount: 0, fiat_amount: 16000, provider: 'yellowcard' }, expiresIn: 300, loading: false, error: null, refetch: mockRefetch, currency: 'NGN', currencySymbol: '₦', submitting: false, confirm: mockConfirm }
  mockConfirm.mockReset()
  mockRefetch.mockReset()
})

test('collapses to the no-wallet notice and hides the payout/CTA', () => {
  mockSelection = { options: [], option: null, selectedKey: '', select: jest.fn() }
  render(<InstantSellTab />)
  expect(screen.getByText('NOTICE:Link a wallet to cash out crypto.')).toBeTruthy()
  expect(screen.queryByText('PAYOUT')).toBeNull()
  expect(screen.queryByText('Confirm cash-out')).toBeNull()
})

test('shows the CTA on a valid amount + account + quote and fires confirm', () => {
  render(<InstantSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  const cta = screen.getByText('Confirm cash-out')
  fireEvent.press(cta)
  expect(mockConfirm).toHaveBeenCalled()
})

test('shows the loading card (and no CTA) while the quote loads', () => {
  mockInstant = { ...mockInstant, quote: null, loading: true }
  render(<InstantSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  expect(screen.getByText('LOADING')).toBeTruthy()
  expect(screen.queryByText('Confirm cash-out')).toBeNull()
})

test('discloses the platform fee for a P2P-routed quote', () => {
  mockInstant = { ...mockInstant, quote: { rate: 1600, fee_amount: 0, fiat_amount: 16000, provider: 'p2p_internal' } }
  render(<InstantSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  expect(screen.getByText('FEE')).toBeTruthy()
})

test('shows the retry card (no CTA) on a failed fetch and fires refetch', () => {
  mockInstant = { ...mockInstant, quote: null, error: 'failed' }
  render(<InstantSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  expect(screen.queryByText('Confirm cash-out')).toBeNull()
  fireEvent.press(screen.getByText('RETRY'))
  expect(mockRefetch).toHaveBeenCalled()
})

test('shows the unavailable-route notice and no CTA when the route is unavailable', () => {
  mockInstant = { ...mockInstant, error: 'unavailable', quote: null }
  render(<InstantSellTab />)
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  expect(screen.getByText(/No cash-out route/i)).toBeTruthy()
  expect(screen.queryByText('Confirm cash-out')).toBeNull()
})
