/**
 * Display arms that only SOME gig-card variants draw — the remote pill, the
 * location separator, the pin/globe pair, the fiat alt — plus the deadline
 * PILL geometry, which only PriceLeading has.
 *
 * Split from `display-branches.test.tsx` (which holds the arms all three
 * variants share) to keep both files under the 300-line house limit. The mock
 * preamble is duplicated rather than shared: jest claims every `.ts` under
 * `__tests__` as a suite, so there is nowhere here to share it from.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import type { GigSummary } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', backgroundAlt: '#f7f7f7', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', primarySurface: '#eef' },
        feedback: {
          warning: { base: '#a60', surface: '#fe8' },
          success: { base: '#0a0', surface: '#cfc' },
          danger: { base: '#c00', surface: '#fcc' },
        },
        // The REAL shape: a fixed record over the five known categories. A
        // Proxy answering every key made the unknown-category path look safe
        // when the production theme returns undefined for it.
        category: {
          delivery: { base: '#123' },
          photo: { base: '#234' },
          errand: { base: '#345' },
          service: { base: '#456' },
          digital: { base: '#567' },
        },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/MoneyText', () => {
  const { Text } = require('react-native')
  return { MoneyText: ({ amountLabel }: { amountLabel: string }) => <Text>{amountLabel}</Text> }
})
// Each icon renders its own name, so a test can tell the clock from the check
// and the pin from the globe — which arm was taken is the point here.
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  function stub(name: string) {
    function Icon() {
      return <Text>{`icon:${name}`}</Text>
    }
    return Icon
  }
  return {
    Clock: stub('clock'),
    Check: stub('check'),
    ArrowLeftRight: stub('cross-border'),
    MapPin: stub('pin'),
    Globe: stub('globe'),
  }
})
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: Record<string, number> }) => unknown) =>
    sel({ rates: { NGN: 150_000, USD: 150 } }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))

import { GigCardCompactPriceLeading } from '@/components/gig/GigCardCompact/PriceLeading'
import { GigCardCompactRich } from '@/components/gig/GigCardCompact/Rich'
import { GigCardCompactClassic } from '@/components/gig/GigCardCompact/Classic'

/** Frozen so "in 30 minutes" means the urgent arm on every run. */
const NOW = Date.parse('2026-07-01T12:00:00.000Z')
const IN_30_MIN = new Date(NOW + 30 * 60_000).toISOString()
const IN_5_DAYS = new Date(NOW + 5 * 86_400_000).toISOString()
const PAST = new Date(NOW - 86_400_000).toISOString()

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW)
})
afterEach(() => {
  jest.useRealTimers()
})

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    escrow_id: 'e1',
    public_feed_revision: '0',
    chain_id: 'eip155:84532',
    asset: 'USDC_BASE',
    amount_raw: '50000000',
    status: 'open',
    accept_deadline: IN_5_DAYS,
    created_at: '2026-06-01T00:00:00.000Z',
    title: 'Paint the fence',
    description: 'Two coats, back fence.',
    category: 'delivery',
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

// ── Arms that only some variants draw ───────────────────────────────────────

test('PriceLeading: a country the location table does not know drops the flag, not the label', () => {
  // `LOCATIONS[country]?.flag ?? ''` — the separator has to go with it, or the
  // card reads "Remote · ".
  render(<GigCardCompactPriceLeading gig={gig({ remote: true, country: 'ZZ' })} />)

  expect(screen.getByText('Remote')).toBeTruthy()
})

test('PriceLeading: a gig with no city shows no location line rather than an empty one', () => {
  render(<GigCardCompactPriceLeading gig={gig({ city: null })} />)

  expect(screen.getByText('Paint the fence')).toBeTruthy()
  expect(screen.queryByText('Lagos')).toBeNull()
})

test.each([
  ['PriceLeading', GigCardCompactPriceLeading],
  ['Classic', GigCardCompactClassic],
] as const)('%s: a cross-border gig is flagged as one', (name, Card) => {
  render(<Card gig={gig({ cross_border: true })} />)

  expect(screen.getByText('icon:cross-border')).toBeTruthy()
  expect(screen.getByText('Cross-border')).toBeTruthy()
})

test.each([
  ['PriceLeading', GigCardCompactPriceLeading],
  ['Rich', GigCardCompactRich],
] as const)('%s: an asset this cache cannot price shows no fiat line', (name, Card) => {
  // Pricing ETH at the SOL rate would read a wildly wrong figure, so the rule
  // answers null and the card must draw nothing rather than a currency symbol
  // with no number.
  render(<Card gig={gig({ asset: 'ETH_BASE', amount_raw: '1000000000000000000' })} />)

  expect(screen.queryByText(/≈/)).toBeNull()
  expect(screen.queryByText(/NGN|₦/)).toBeNull()
})

test('Rich: an on-site gig reads On-site in the pill the remote one reads Remote in', () => {
  render(<GigCardCompactRich gig={gig({ remote: false })} />)

  expect(screen.getByText('On-site')).toBeTruthy()
})

test('Rich: a gig with no city drops the separator with the location', () => {
  render(<GigCardCompactRich gig={gig({ city: null })} />)

  expect(screen.getByText('On-site')).toBeTruthy()
  expect(screen.queryByText('·')).toBeNull()
})

test('Classic: an on-site gig gets the pin, a remote one the globe', () => {
  const { unmount } = render(<GigCardCompactClassic gig={gig({ remote: false })} />)
  expect(screen.getByText('icon:pin')).toBeTruthy()
  unmount()

  render(<GigCardCompactClassic gig={gig({ remote: true })} />)
  expect(screen.getByText('icon:globe')).toBeTruthy()
})

/**
 * PriceLeading draws its deadline as a rounded PILL; the chain badge next to it
 * uses a much smaller radius. Counting fully-round nodes therefore counts
 * chips, which is the only way to catch a chip that renders EMPTY — dropping
 * the `label ?` guard leaves a blank pill that every text assertion still
 * passes straight through.
 */
function pillCount(): number {
  let n = 0
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node === null || typeof node !== 'object') return
    const el = node as { props?: { style?: unknown }; children?: unknown }
    const style = StyleSheet.flatten(el.props?.style) as ViewStyle | undefined
    if (style?.borderRadius === 9999) n += 1
    walk(el.children)
  }
  walk(screen.toJSON())
  return n
}

test('PriceLeading: a deadline draws exactly one pill', () => {
  render(<GigCardCompactPriceLeading gig={gig({ accept_deadline: IN_30_MIN })} />)

  expect(pillCount()).toBe(1)
})

test('PriceLeading: no deadline draws NO pill, not an empty one', () => {
  render(<GigCardCompactPriceLeading gig={gig({ accept_deadline: null })} />)

  expect(pillCount()).toBe(0)
})

test('PriceLeading: a cross-border gig with no location shows no orphan separator', () => {
  // The separator exists only to join a location to the cross-border flag. A
  // non-remote gig whose city the poster left blank has nothing to join, and a
  // lone "·" in the meta row reads as a rendering fault.
  render(<GigCardCompactPriceLeading gig={gig({ city: null, cross_border: true })} />)

  expect(screen.getByText('Cross-border')).toBeTruthy()
  expect(screen.queryByText('·')).toBeNull()
})

test('PriceLeading: with a location the separator DOES join the two', () => {
  render(<GigCardCompactPriceLeading gig={gig({ city: 'Lagos', cross_border: true })} />)

  expect(screen.getByText('Lagos')).toBeTruthy()
  expect(screen.getByText('·')).toBeTruthy()
})

test.each([
  ['PriceLeading', GigCardCompactPriceLeading],
  ['Rich', GigCardCompactRich],
] as const)('%s: a sub-1 amount keeps a THIRD decimal', (name, Card) => {
  // `toFixed(amount >= 1 ? 2 : 3)`. Two decimals on a 0.5 SOL gig would round
  // 0.005 to "0.01" — a 100% error on the number a worker is deciding by. The
  // real shared money rule runs here; only the raw amount changes.
  render(<Card gig={gig({ amount_raw: '500000' })} />)

  expect(screen.getByText(/0\.500/)).toBeTruthy()
})

test.each([
  ['PriceLeading', GigCardCompactPriceLeading],
  ['Rich', GigCardCompactRich],
] as const)('%s: a remote gig in an unknown country drops the flag AND its separator', (name, Card) => {
  // `LOCATIONS[country]?.flag ?? ''` then `Remote${flag ? ` · ${flag}` : ''}`.
  // Both halves matter: keeping the separator without a flag renders
  // "Remote · " with nothing after it.
  render(<Card gig={gig({ remote: true, country: 'ZZ' })} />)

  expect(screen.getAllByText('Remote').length).toBeGreaterThan(0)
  expect(screen.queryByText(/Remote ·/)).toBeNull()
})

test.each([
  ['PriceLeading', GigCardCompactPriceLeading],
  ['Rich', GigCardCompactRich],
  ['Classic', GigCardCompactClassic],
] as const)('%s: an asset this build has no metadata for shows NO figure', (name, Card) => {
  // `ASSET_META` is the source the server's asset seed is built FROM, so an
  // unknown asset means this install is older than the seed. Its decimals are
  // unknown, and base units are wrong by 10^decimals — 1462000000 where the
  // real amount is 1462. The card names the asset and withholds the number.
  render(<Card gig={gig({ asset: 'USDT_FUTURE', amount_raw: '1462000000' })} />)

  expect(screen.getByText(/—/)).toBeTruthy()
  expect(screen.queryByText(/1462000000|1,462,000,000/)).toBeNull()
})
