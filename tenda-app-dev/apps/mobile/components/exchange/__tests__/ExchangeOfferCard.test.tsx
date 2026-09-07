/**
 * ExchangeOfferCard — the market browse row. Verifies the enriched context a
 * buyer needs before opening an offer: seller name, network, the asset→fiat
 * trade, rate, and the payment window — plus the optional status badge.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
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
jest.mock('expo-router', () => ({ useRouter: jest.fn(() => ({ push: jest.fn() })) }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Avatar', () => ({ Avatar: () => null }))
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  chainLabel: () => 'Solana',
}))
jest.mock('../ExchangeStatusBadge', () => {
  const { Text } = require('react-native')
  return { ExchangeStatusBadge: ({ status }: { status: string }) => <Text>{`status:${status}`}</Text> }
})

import { useRouter } from 'expo-router'
import { ExchangeOfferCard } from '../ExchangeOfferCard'

const creator: UserRef = {
  id: 'u1', first_name: 'Ada', last_name: 'Obi', avatar_url: null, review_score: '4.7',
  is_seeker: false, is_agent: false, country: 'NG',
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
  created_at: '2026-08-15T12:00:00.000Z',
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

describe('the rate is compared, not just displayed', () => {
  // The file header has always claimed this card "verifies ... rate", and no
  // assertion did. Every fixture rate here is a whole number, which is exactly
  // why `formatFiat` — the AMOUNT formatter, which drops to whole units —
  // survived on this line on both platforms.
  const at = (rate: string, fiat_currency: string): string => {
    const view = render(<ExchangeOfferCard offer={{ ...offer, rate, fiat_currency }} />)
    const text = screen.getByText(/\//).children.join('')
    view.unmount()
    return text
  }

  test('two close GHS rates stay distinguishable', () => {
    // ~15/USDC is where this bites: whole-unit rounding is a 3% band.
    expect(at('15.4000000000', 'GHS')).not.toEqual(at('15.4900000000', 'GHS'))
  })

  test('a fractional rate keeps its decimals; a whole one stays whole', () => {
    expect(at('15.4000000000', 'GHS')).toContain('15.40')
    expect(at('1600.0000000000', 'NGN')).toContain('1,600')
    expect(at('1600.0000000000', 'NGN')).not.toContain('1,600.00')
  })
})

test('tapping the row opens THAT offer', () => {
  // The row's whole job. Never asserted: the suite rendered it six times and
  // pressed it none.
  const push = jest.fn()
  ;(useRouter as jest.Mock).mockReturnValue({ push })
  render(<ExchangeOfferCard offer={{ ...offer, escrow_id: 'esc-42' }} />)
  fireEvent.press(screen.getByText('Ada Obi'))
  expect(push).toHaveBeenCalledWith('/exchange/esc-42')
})

test('an asset the display metadata does not know renders as its raw id', () => {
  // The twin of the same fallback in ExchangeTermsCard, and of the one the web
  // audit found untested. `asset` is a plain string on the wire.
  render(<ExchangeOfferCard offer={{ ...offer, asset: 'USDC_NEWCHAIN' }} />)
  // The RATE row specifically ("<rate>/<symbol>", no space) — the amount row
  // above it renders the same id through formatAssetAmount's own fallback.
  expect(screen.getByText(/\/USDC_NEWCHAIN$/)).toBeTruthy()
})
