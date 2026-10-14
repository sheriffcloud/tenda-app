/**
 * WHERE the chain reads on a gig card, across all three variants.
 *
 * Which chain a gig pays on decides whether the reader holds a wallet that can
 * take it, so it belongs beside the category — the first thing scanned — not
 * parked under the money block (PriceLeading), down in the foot row (Rich) or
 * on a line of its own (Classic), which is where all three used to put it.
 *
 * The assertion is STRUCTURAL rather than a snapshot: it finds the deepest
 * container holding BOTH the chain name and the category label, and checks
 * that container is a wrapping row that does not also contain the title. Move
 * the badge back anywhere else and that container becomes the card itself,
 * which does contain the title.
 *
 * The wrap is checked too, because it is the reason this fits at all. Measured
 * at a 320px device the row has 174px (PriceLeading) / 248px (Rich) against
 * ~245px of content, so without `flexWrap` the category is squeezed away.
 * There is no layout engine in the RN test renderer — the rule is what can be
 * pinned here, and the widths are recorded in each variant's stylesheet.
 */
import { render, screen, within } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import type { GigSummary } from '@tenda/shared'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
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
  return {
    Clock: stub, Check: stub, ArrowLeftRight: stub,
    MapPin: stub, Globe: stub,
  }
})
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: null }) => unknown) => sel({ rates: null }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  toAssetPaymentDisplay: () => ({ amount: 50, symbol: 'USDC', fiat: null }),
  formatFiat: () => '',
}))

// Each variant from its own module rather than the barrel, matching the
// sibling suites: importing the barrel drags its re-exports into the coverage
// gate's subject list for no benefit to this test.
import { GigCardCompactPriceLeading } from '@/components/gig/GigCardCompact/PriceLeading'
import { GigCardCompactRich } from '@/components/gig/GigCardCompact/Rich'
import { GigCardCompactClassic } from '@/components/gig/GigCardCompact/Classic'

const TITLE = 'Paint the fence'
/** Testnet names are the long ones, and the long ones are what forces the wrap. */
const CHAIN = 'Solana Devnet'
const CATEGORY = 'Delivery'

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    escrow_id: 'e1',
    public_feed_revision: '0',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '50000000',
    status: 'open',
    accept_deadline: '2026-09-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    title: TITLE,
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

// Taken off RTL's own query rather than imported from `react-test-renderer`,
// which ships no types.
type Node = ReturnType<typeof screen.getByText>

function ancestors(node: Node): Node[] {
  const chain: Node[] = []
  for (let cur = node.parent; cur; cur = cur.parent) chain.push(cur)
  return chain
}

/** The deepest container that holds both nodes — i.e. the row they share. */
function sharedContainer(a: Node, b: Node): Node {
  const bAncestors = new Set(ancestors(b))
  const found = ancestors(a).find((n) => bAncestors.has(n))
  if (!found) throw new Error('the two nodes share no ancestor at all')
  return found
}

function expectChainSharesTheCategoryRow(): void {
  const row = sharedContainer(screen.getByText(CHAIN), screen.getByText(CATEGORY))
  const style = StyleSheet.flatten(row.props.style) as ViewStyle

  expect(style.flexDirection).toBe('row')
  // Without this the row cannot hold all three labels at 320px.
  expect(style.flexWrap).toBe('wrap')
  // If the badge slid back down the card, the shared container would be the
  // card — and the card holds the title.
  expect(within(row).queryByText(TITLE)).toBeNull()
}

test('PriceLeading reads the chain on the category row, not under the money', () => {
  render(<GigCardCompactPriceLeading gig={gig()} />)
  expectChainSharesTheCategoryRow()
})

test('Rich reads the chain on the category row, not in the foot', () => {
  // Rich is the variant the public feed actually renders (home.tsx passes
  // variant="rich"), so this is the one a browsing worker sees.
  render(<GigCardCompactRich gig={gig()} />)
  expectChainSharesTheCategoryRow()
})

test('Classic reads the chain on the category row, not on a line of its own', () => {
  render(<GigCardCompactClassic gig={gig()} />)
  expectChainSharesTheCategoryRow()
})

test('the chain still reads on a card showing status instead of category', () => {
  // `showStatus` swaps the category label for the escrow status in the same
  // slot — the my-gigs list renders it that way, and the badge has to survive
  // the swap rather than being anchored to the category text.
  render(<GigCardCompactPriceLeading gig={gig()} showStatus />)
  const row = sharedContainer(screen.getByText(CHAIN), screen.getByText('Open'))

  expect(StyleSheet.flatten(row.props.style).flexWrap).toBe('wrap')
  expect(within(row).queryByText(TITLE)).toBeNull()
})
