/**
 * MyOfferRow — a row in the "My Trades" list. Verifies it renders the amount +
 * currency, the status, and the SELLING/BUYING side tag that tells the two
 * sides of the same list apart.
 */
import { render, screen } from '@testing-library/react-native'
import type { EscrowListRow } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      border: { subtle: '#ddd' },
      content: { primary: '#111', tertiary: '#999' },
      brand: { primary: '#50f' },
      accent: { primary: '#fa0' },
    } },
  }),
}))
jest.mock('lucide-react-native', () => ({ ChevronRight: () => null }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Spacer', () => ({ Spacer: () => null }))
jest.mock('../ExchangeStatusBadge', () => {
  const { Text } = require('react-native')
  return { ExchangeStatusBadge: ({ status }: { status: string }) => <Text>{`status:${status}`}</Text> }
})

import { MyOfferRow } from '../MyOfferRow'

const base: EscrowListRow = {
  id: 'esc-1', kind: 'exchange', status: 'open', chain_id: 'solana:devnet',
  asset: 'USDC_SOL', amount_raw: '2500000', title: null, fiat_currency: 'NGN',
  creator_id: 'me', counterparty_id: null, accept_deadline: null, created_at: '2026-08-15T12:00:00.000Z',
}

test('selling side shows the SELLING tag, amount → currency, and status', () => {
  render(<MyOfferRow offer={base} side="selling" />)
  expect(screen.getByText('SELLING')).toBeTruthy()
  expect(screen.getByText(/2\.5.*USDC.*NGN/)).toBeTruthy()
  expect(screen.getByText('status:open')).toBeTruthy()
})

test('buying side shows the BUYING tag', () => {
  render(<MyOfferRow offer={{ ...base, status: 'accepted' }} side="buying" />)
  expect(screen.getByText('BUYING')).toBeTruthy()
  expect(screen.queryByText('SELLING')).toBeNull()
  expect(screen.getByText('status:accepted')).toBeTruthy()
})

test('omits the currency arrow when fiat_currency is null', () => {
  render(<MyOfferRow offer={{ ...base, fiat_currency: null }} side="selling" />)
  expect(screen.queryByText(/→/)).toBeNull()
})
