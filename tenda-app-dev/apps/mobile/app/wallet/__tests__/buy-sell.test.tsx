/**
 * /wallet/buy-sell is the unified sell screen: two tabs (Instant / Create
 * offer). Verifies it defaults to Instant, deep-links to the offer tab via
 * ?mode=offer, falls back on an unknown mode, and switches tabs on tap.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

let mockParams: { mode?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/theme/tokens', () => ({ spacing: { sm: 8, md: 16 } }))
jest.mock('@/components/ui', () => {
  const { View, Text, Pressable } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
    SegmentedTabs: ({ tabs, onChange }: { tabs: { key: string; label: string }[]; onChange: (k: string) => void }) => (
      <>
        {tabs.map((t) => (
          <Pressable key={t.key} accessibilityRole="button" onPress={() => onChange(t.key)}>
            <Text>{`tab:${t.label}`}</Text>
          </Pressable>
        ))}
      </>
    ),
  }
})
jest.mock('@/components/wallet/sell', () => {
  const { Text } = require('react-native')
  return {
    InstantSellTab: () => <Text>INSTANT_TAB</Text>,
    OfferSellTab: () => <Text>OFFER_TAB</Text>,
  }
})

import SellScreen from '../buy-sell'

beforeEach(() => { mockParams = {} })

test('renders the Sell crypto header', () => {
  render(<SellScreen />)
  expect(screen.getByText('Sell crypto')).toBeTruthy()
})

test('defaults to the Instant tab', () => {
  render(<SellScreen />)
  expect(screen.getByText('INSTANT_TAB')).toBeTruthy()
  expect(screen.queryByText('OFFER_TAB')).toBeNull()
})

test('deep-links to the offer tab via ?mode=offer', () => {
  mockParams = { mode: 'offer' }
  render(<SellScreen />)
  expect(screen.getByText('OFFER_TAB')).toBeTruthy()
  expect(screen.queryByText('INSTANT_TAB')).toBeNull()
})

test('an unknown mode falls back to Instant', () => {
  mockParams = { mode: 'bogus' }
  render(<SellScreen />)
  expect(screen.getByText('INSTANT_TAB')).toBeTruthy()
})

test('switches tabs on tap', () => {
  render(<SellScreen />)
  fireEvent.press(screen.getByText('tab:Create offer'))
  expect(screen.getByText('OFFER_TAB')).toBeTruthy()
  fireEvent.press(screen.getByText('tab:Instant'))
  expect(screen.getByText('INSTANT_TAB')).toBeTruthy()
})
