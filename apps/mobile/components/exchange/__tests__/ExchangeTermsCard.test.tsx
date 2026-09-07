/**
 * ExchangeTermsCard — the #1 fix: the exchange detail must surface the live,
 * status-aware deadline (Accept in / Pay in / Confirm in) as a ticking H:MM:SS
 * clock, not just the static payment-window duration. Statuses with no live
 * deadline show no row.
 */
import { render, screen } from '@testing-library/react-native'
import type { ExchangeDetail, EscrowStatus, UserRef } from '@tenda/shared'
import { exchangeDetail } from '../__fixtures__/exchange-detail'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
      content: { primary: '#111', secondary: '#555', tertiary: '#999' },
      feedback: {
        warning: { base: '#c97', surface: '#fed', text: '#850', border: '#eca' },
        danger: { base: '#c33', surface: '#fdd', text: '#811', border: '#eaa' },
      },
    } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

// Preloaded platform config so useEscrowFee's REAL math runs: 1.00% regular,
// 0.50% seeker. Tests flip `config` to null to cover the not-loaded path.
const configState: { config: { fee_bps: number; seeker_fee_bps: number; grace_period_seconds: number } | null } = {
  config: { fee_bps: 100, seeker_fee_bps: 50, grace_period_seconds: 172_800 },
}
jest.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: <T,>(selector: (s: {
    config: typeof configState.config
    loading: boolean
    error: string | null
    fetch: () => Promise<typeof configState.config>
  }) => T): T =>
    selector({
      config: configState.config,
      loading: false,
      error: null,
      fetch: async () => configState.config,
    }),
}))

import { ExchangeTermsCard } from '../ExchangeTermsCard'

const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString()
/** The live clock renders as total-hours H:MM:SS ("5:23:04", "49:59:58"). */
const CLOCK = /^\d+:\d{2}:\d{2}$/

const user: UserRef = {
  id: 'u1', first_name: 'A', last_name: 'B', avatar_url: null, review_score: '0', is_seeker: false, country: 'NG',
}

function makeOffer(
  status: EscrowStatus,
  deadlines: Partial<Pick<ExchangeDetail, 'accept_deadline' | 'completion_deadline' | 'approval_deadline'>>,
  overrides: Partial<ExchangeDetail> = {},
): ExchangeDetail {
  return exchangeDetail({ status, created_at: iso(-1), creator: user, ...deadlines, ...overrides })
}

afterEach(() => {
  configState.config = { fee_bps: 100, seeker_fee_bps: 50, grace_period_seconds: 172_800 }
})

test('always shows rate and the payment-window duration', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Rate')).toBeTruthy()
  expect(screen.getByText('Payment window')).toBeTruthy()
})

test('names the network the escrow lives on (from the chain manifest)', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Network')).toBeTruthy()
})

test('buyer net = amount − platform fee at the regular tier (100 − 1% = 99)', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Platform fee (1.00%)')).toBeTruthy()
  expect(screen.getByText('− 1 USDC')).toBeTruthy()
  expect(screen.getByText('Buyer receives')).toBeTruthy()
  expect(screen.getByText('99 USDC')).toBeTruthy()
})

test('a seeker-tier escrow projects the DISCOUNTED fee (0.50%), never the regular one', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) }, { is_seeker: true })} />)
  expect(screen.getByText('Platform fee (0.50%)')).toBeTruthy()
  expect(screen.getByText('− 0.5 USDC')).toBeTruthy()
  expect(screen.getByText('99.5 USDC')).toBeTruthy()
})

test('config not yet loaded → fee/net rows degrade to em-dash, never a wrong number', () => {
  configState.config = null
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Platform fee')).toBeTruthy()
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  expect(screen.queryByText('99 USDC')).toBeNull()
})

test('shows the listed date when created_at is present', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Listed')).toBeTruthy()
})

test('open → "Accept in" with a live countdown clock', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: iso(5) })} />)
  expect(screen.getByText('Accept in')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('accepted → "Pay in" the completion deadline as a clock', () => {
  render(<ExchangeTermsCard offer={makeOffer('accepted', { completion_deadline: iso(3) })} />)
  expect(screen.getByText('Pay in')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('submitted → "Confirm in" the approval deadline (never gig wording)', () => {
  render(<ExchangeTermsCard offer={makeOffer('submitted', { approval_deadline: iso(10) })} />)
  expect(screen.getByText('Confirm in')).toBeTruthy()
  expect(screen.queryByText('Review by')).toBeNull()
  expect(screen.queryByText('Deliver by')).toBeNull()
})

test('open but indefinitely open (null accept deadline) → no deadline row', () => {
  render(<ExchangeTermsCard offer={makeOffer('open', { accept_deadline: null })} />)
  expect(screen.queryByText('Accept in')).toBeNull()
  expect(screen.queryByText(CLOCK)).toBeNull()
})

test('terminal/draft statuses show no live-deadline row', () => {
  for (const status of ['draft', 'completed', 'cancelled'] as EscrowStatus[]) {
    const { unmount } = render(<ExchangeTermsCard offer={makeOffer(status, { completion_deadline: iso(5) })} />)
    expect(screen.queryByText('Pay in')).toBeNull()
    expect(screen.queryByText('Accept in')).toBeNull()
    unmount()
  }
})
