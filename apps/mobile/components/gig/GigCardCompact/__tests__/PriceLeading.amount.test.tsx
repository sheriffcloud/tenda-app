/**
 * The price strip has a FIXED 86px width and 10px of padding either side, so
 * 66px of content — and that is the whole problem this pins.
 *
 * JetBrains Mono is a fixed 0.6em advance, so at the amount's 20px every
 * character is 11.6px: amount and symbol side by side want ~84px for
 * '50.00 USDC' and ~108px for '1462.00 USDC'. Neither fits.
 * Because `priceStrip` is a column with `alignItems: 'flex-start'`, an
 * unconstrained child is sized to its own max-content width instead of being
 * clipped, so the money simply painted out over the card body — reported on My
 * Gigs, where a four-figure gig ran past the strip's border.
 *
 * The fix is three rules that only work together:
 *   1. the block STRETCHES, so there is a 66px box to fit into at all;
 *   2. the symbol sits UNDER the digits, handing them the whole 66px;
 *   3. long digits auto-size down instead of overflowing.
 * Drop any one and the other two go inert, which is why each is asserted.
 *
 * There is no layout engine in the RN test renderer, so this pins the rules
 * rather than the pixels. The pixel reasoning lives in the stylesheet.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
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
// Forwards props, unlike the sibling suites' mock: `numberOfLines` and
// `adjustsFontSizeToFit` ARE the subject here, and a mock that drops them
// would let the test pass with the fix removed.
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: (props: Record<string, unknown>) => <Text {...props} /> }
})
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  const stub = () => <Text>icon</Text>
  return { Clock: stub, Check: stub, ArrowLeftRight: stub }
})
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: null }) => unknown) => sel({ rates: null }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))

import { GigCardCompactPriceLeading } from '@/components/gig/GigCardCompact/PriceLeading'

/** The reported case: four figures, which needs ~99px beside its symbol. */
const AMOUNT = '1462.00'
const SYMBOL = 'USDC'

jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  toAssetPaymentDisplay: () => ({ amount: 1462, symbol: 'USDC', fiat: null }),
  formatFiat: () => '',
}))

function gig(): GigSummary {
  return {
    escrow_id: 'e1',
    public_feed_revision: '0',
    chain_id: 'eip155:84532',
    asset: 'USDC_BASE',
    amount_raw: '1462000000',
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

/**
 * The strip's money block — the deepest container holding both money lines.
 *
 * A walk rather than `.parent`, because each `<Text>` sits inside its own
 * component instance and the two therefore have DIFFERENT immediate parents;
 * the shared View is a level further up. Nodes are compared by identity inside
 * a Set and never handed to `expect`: jest serialises both sides of a failed
 * `toBe`, and a render-tree node serialises until the heap runs out. Duplicated
 * from the sibling placement suite on purpose — jest claims every `.ts` under
 * `__tests__` as a suite, so there is nowhere here to share it from.
 */
function priceBlockStyle(): ViewStyle {
  const unitAncestors = new Set(ancestors(screen.getByText(SYMBOL)))
  const block = ancestors(screen.getByText(AMOUNT)).find((n) => unitAncestors.has(n))
  if (!block) throw new Error('the amount and its symbol share no container at all')
  return StyleSheet.flatten(block.props.style) as ViewStyle
}

test('the money block is stretched, so the 86px strip actually constrains it', () => {
  // The load-bearing one. `priceStrip` is `alignItems: 'flex-start'`, so
  // without this the block is sized to its own content and paints straight out
  // over the card body — and every rule below has no box to measure against.
  render(<GigCardCompactPriceLeading gig={gig()} />)

  expect(priceBlockStyle().alignSelf).toBe('stretch')
})

test('the symbol sits under the digits rather than beside them', () => {
  // Side by side, '50.00 USDC' already wanted ~78px of a 66px box, so the
  // asset elided on ORDINARY gigs and not just large ones. Stacked, the digits
  // get the full width and the symbol always reads whole.
  render(<GigCardCompactPriceLeading gig={gig()} />)

  expect(priceBlockStyle().flexDirection).not.toBe('row')
})

test('a long amount shrinks to fit instead of painting outside the card', () => {
  render(<GigCardCompactPriceLeading gig={gig()} />)
  const amount = screen.getByText(AMOUNT)

  expect(amount.props.adjustsFontSizeToFit).toBe(true)
  // Auto-sizing is a no-op without a line cap to measure the fit against.
  expect(amount.props.numberOfLines).toBe(1)
  // Floored, so a pathological amount degrades to small rather than illegible.
  expect(amount.props.minimumFontScale).toBeGreaterThanOrEqual(0.7)
  // ...and not so low the digits become unreadable to win an edge case.
  expect(amount.props.minimumFontScale).toBeLessThanOrEqual(0.8)
})

test('the symbol is never truncated away', () => {
  // It is the one part of the money a reader cannot infer: 1462 of WHAT.
  render(<GigCardCompactPriceLeading gig={gig()} />)
  const unit = screen.getByText(SYMBOL)

  expect(unit.props.numberOfLines).toBe(1)
  expect((StyleSheet.flatten(unit.props.style) as TextStyle).fontSize).toBe(11)
})
