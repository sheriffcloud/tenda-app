/**
 * The default feed card (PriceLeading) surfaces the gig's chain next to its
 * price, so a worker sees which network a payout lives on before tapping in.
 * Heavy deps (router, theme, stores, currency, icons) are mocked; the real
 * ChainBadge + manifest resolve the label end-to-end.
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
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: null }) => unknown) => sel({ rates: null }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))
jest.mock('@/lib/currency', () => ({
  toAssetPaymentDisplay: () => ({ amount: 50, symbol: 'USDC', fiat: null }),
  formatFiat: () => '',
}))

import { GigCardCompactPriceLeading } from '@/components/gig/GigCardCompact/PriceLeading'

function gig(overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    escrow_id: 'e1',
    public_feed_revision: '0',
    chain_id: 'eip155:84532',
    asset: 'USDC',
    amount_raw: '50000000',
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
    requires_approval: false,
    creator: {
      id: 'u1',
      first_name: 'Ada',
      last_name: 'P',
      avatar_url: null,
      review_score: null,
      country: 'NG',
      is_seeker: false,
    },
    ...overrides,
  }
}

test('shows the chain name for the gig (Base Sepolia)', () => {
  render(<GigCardCompactPriceLeading gig={gig()} />)
  expect(screen.getByText('Base Sepolia')).toBeTruthy()
})

test('shows a Solana gig on the Solana network', () => {
  render(<GigCardCompactPriceLeading gig={gig({ chain_id: 'solana:devnet', asset: 'USDC_SOL' })} />)
  expect(screen.getByText('Solana Devnet')).toBeTruthy()
})
