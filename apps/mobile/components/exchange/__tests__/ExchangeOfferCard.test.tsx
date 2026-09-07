/**
 * ExchangeOfferCard — the market browse row. Verifies the enriched context a
 * buyer needs before opening an offer: seller name, network, the asset→fiat
 * trade, rate, and the payment window — plus the optional status badge.
 */
import { render, screen } from '@testing-library/react-native'
import type { ExchangeSummary, UserRef } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { inset: '#eee' }, border: { subtle: '#ddd' },
      content: { primary: '#111', secondary: '#555', tertiary: '#999' },
      accent: { primary: '#fa0' },
    } },
  }),
}))
jest.mock('lucide-react-native', () => ({ ChevronRight: () => null, Clock: () => null }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Avatar', () => ({ Avatar: () => null }))
jest.mock('@/lib/chains', () => ({ chainLabel: () => 'Solana' }))
jest.mock('../ExchangeStatusBadge', () => {
  const { Text } = require('react-native')
  return { ExchangeStatusBadge: ({ status }: { status: string }) => <Text>{`status:${status}`}</Text> }
})

import { ExchangeOfferCard } from '../ExchangeOfferCard'

const creator: UserRef = {
  id: 'u1', first_name: 'Ada', last_name: 'Obi', avatar_url: null, review_score: '4.7',
  is_seeker: false, country: 'NG',
}

const offer: ExchangeSummary = {
  escrow_id: 'esc-1',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '2500000', // 2.5 USDC (6 decimals)
  status: 'open',
  fiat_amount: '4000000',
  fiat_currency: 'NGN',
  rate: '1600000',
  payment_window_seconds: 12 * 3600,
  accept_deadline: null,
  created_at: null,
  creator,
}

test('shows seller name, network, the trade, rate and window', () => {
  render(<ExchangeOfferCard offer={offer} />)
  expect(screen.getByText('Ada Obi')).toBeTruthy()
  expect(screen.getByText('Solana')).toBeTruthy() // network pill
  expect(screen.getByText(/2\.5.*USDC/)).toBeTruthy() // asset amount
  expect(screen.getByText(/@ada/)).toBeTruthy() // handle
  expect(screen.getByText(/4\.7/)).toBeTruthy() // rating
  expect(screen.getByText('Pay within 12h')).toBeTruthy() // payment window
})

test('hides the status badge on the market variant (showStatus defaults false)', () => {
  render(<ExchangeOfferCard offer={offer} />)
  expect(screen.queryByText(/^status:/)).toBeNull()
})

test('shows the status badge when showStatus is set', () => {
  render(<ExchangeOfferCard offer={offer} showStatus />)
  expect(screen.getByText('status:open')).toBeTruthy()
})

test('falls back to "Seller" when the creator has no name', () => {
  const anon: ExchangeSummary = {
    ...offer,
    creator: { ...creator, first_name: '', last_name: '' },
  }
  render(<ExchangeOfferCard offer={anon} />)
  expect(screen.getByText('Seller')).toBeTruthy()
})

test('a WHITESPACE-only name falls back too, and shows no bare "@" handle', () => {
  // ONE bug here, not two — established by mutation, not assumed. The name line
  // was already correct: it used `\`${f ?? ''} ${l ?? ''}\`.trim()`, which
  // collapses whitespace to '' and fires the fallback. (Reverting it to that
  // form still passes this test; the switch to formatFullName is a consistency
  // change, behaviour-identical on every input.) The HANDLE beside it was the
  // bug: it tested `first_name` for truthiness, so '  ' rendered the string
  // '@  ' — an at-sign with nothing after it, plus a separator dot.
  //
  // The name assertion stays as a regression guard for the half that worked.
  const blank: ExchangeSummary = {
    ...offer,
    creator: { ...creator, first_name: '  ', last_name: '   ' },
  }
  render(<ExchangeOfferCard offer={blank} />)

  expect(screen.getByText('Seller')).toBeTruthy()
  // The regex, not `queryByText('@  ')`. Measured: either one alone kills the
  // mutant, so keeping both was decoration — and this one is the stronger of
  // the two, catching '@', '@ ' and any other empty-handle variant rather than
  // the single literal this bug happened to produce.
  expect(screen.queryByText(/^@/)).toBeNull()
})

test('omits the rating when the seller is unrated', () => {
  const unrated: ExchangeSummary = { ...offer, creator: { ...creator, review_score: null } }
  render(<ExchangeOfferCard offer={unrated} />)
  expect(screen.queryByText(/4\.7/)).toBeNull()
})
