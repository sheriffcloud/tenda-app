/**
 * The feed card's fiat alt line, end to end through the REAL money rule (#76).
 *
 * Its sibling PriceLeading.chain.test.tsx mocks `toAssetPaymentDisplay` to a
 * fixed `{ fiat: null }`, which is right for a test about the chain badge and
 * useless for this one: it stubs out the very thing under test. So nothing here
 * mocks @tenda/shared at all — the rate cache goes in, and what the reader sees
 * beside the amount comes out.
 *
 * What it pins is the bug #76 was filed for. A gig denominated in a STABLE used
 * to render its amount with the "≈ ₦…" line empty, because the rule answered a
 * fiat equivalent only for SOL — while the composer, using the other copy of the
 * rule, showed a naira figure for the same money. One rule now, in shared.
 *
 * Values are asserted as DIGITS with the currency formatting stripped. The
 * formatting is `formatFiat`'s own job and has its own tests; re-asserting a
 * locale's symbol and grouping here would make this fail on an ICU build
 * difference rather than on a mispriced gig.
 */
import { render, screen } from '@testing-library/react-native'
import type { GigSummary } from '@tenda/shared'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', backgroundAlt: '#f7f7f7', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f' },
        feedback: {
          warning: { base: '#a60', surface: '#fe8' },
          success: { base: '#0a0', surface: '#cfc' },
          danger: { base: '#c00', surface: '#fcc' },
        },
        category: new Proxy({}, { get: () => ({ base: '#123' }) }),
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  const stub = () => <Text>icon</Text>
  return { Clock: stub, Check: stub, ArrowLeftRight: stub }
})

/** NGN 150,000 per SOL and USD 150 per SOL, so a stable is NGN 1,000 per unit. */
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: Record<string, number> }) => unknown) =>
    sel({ rates: { NGN: 150_000, USD: 150 } }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))

import { GigCardCompactPriceLeading } from '@/components/gig/GigCardCompact/PriceLeading'

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    escrow_id: 'e1',
    public_feed_revision: '0',
    chain_id: 'eip155:84532',
    asset: 'USDC_BASE',
    amount_raw: '50000000', // 50 USDC at 6 decimals
    status: 'open',
    accept_deadline: null,
    created_at: '2026-07-01T00:00:00.000Z',
    title: 'Paint the fence',
    description: null,
    category: 'errand',
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    remote: false,
    cross_border: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    creator: {
      id: 'u1',
      first_name: 'Ada',
      last_name: 'P',
      avatar_url: null,
      review_score: null,
      country: 'NG',
      is_seeker: false,
      is_agent: false,
    },
    ...overrides,
  }
}

/** The alt line's value, with symbol and grouping removed. */
function fiatDigits(): string {
  const node = screen.getByText(/^≈/)
  return String(node.props.children).replace(/\D/g, '')
}

test('a STABLE gig shows a fiat equivalent — the line that used to be blank', () => {
  // 50 USDC x (NGN 150,000 / USD 150) = NGN 50,000. Before #76 this rendered
  // nothing at all, because the rule answered null for anything but SOL.
  render(<GigCardCompactPriceLeading gig={gig()} />)
  expect(fiatDigits()).toBe('50000')
})

test('a SOL gig is unchanged — it takes the cache rate directly', () => {
  render(
    <GigCardCompactPriceLeading
      gig={gig({ chain_id: 'solana:devnet', asset: 'SOL_DEVNET', amount_raw: '2000000000' })}
    />,
  )
  // 2 SOL x NGN 150,000, with no USD leg involved.
  expect(fiatDigits()).toBe('300000')
})

test('a native token this cache cannot price shows NO fiat rather than a wrong one', () => {
  // The arm #76 added. Pricing 1 ETH at the SOL rate would read NGN 150,000 for
  // something worth many times that, so the honest answer is no line at all —
  // which is also what the card did for every non-SOL asset before the fix.
  render(
    <GigCardCompactPriceLeading gig={gig({ asset: 'ETH_BASE', amount_raw: '1000000000000000000' })} />,
  )
  expect(screen.queryByText(/^≈/)).toBeNull()
})
