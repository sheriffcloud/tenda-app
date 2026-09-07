/**
 * The agent badge on the feed (#19): every card variant names an agent
 * poster with the SHARED label, beside the chain — the first thing scanned —
 * and shows nothing of the kind for a human poster. A gig taken from
 * software is a different decision than one taken from a person, so the
 * fact cannot be a detail-screen surprise.
 */
import { render, screen } from '@testing-library/react-native'
import { AGENT_BADGE_LABEL, type GigSummary } from '@tenda/shared'

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
  return { Clock: stub, Check: stub, ArrowLeftRight: stub, MapPin: stub, Globe: stub, Bot: stub }
})
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: null }) => unknown) => sel({ rates: null }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: 'NGN' }),
}))

import { GigCardCompactClassic } from '../Classic'
import { GigCardCompactRich } from '../Rich'
import { GigCardCompactPriceLeading } from '../PriceLeading'

function gig(is_agent: boolean): GigSummary {
  return {
    escrow_id: 'e-1',
    public_feed_revision: '1',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '25000000',
    status: 'open',
    accept_deadline: null,
    created_at: '2026-08-01T00:00:00.000Z',
    title: 'Deliver a parcel',
    description: null,
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
      id: 'u-1', first_name: 'Dispatch', last_name: '', avatar_url: null, review_score: null,
      country: 'NG', is_seeker: false, is_agent,
    },
  }
}

const VARIANTS = [
  ['Classic', GigCardCompactClassic],
  ['Rich', GigCardCompactRich],
  ['PriceLeading', GigCardCompactPriceLeading],
] as const

describe.each(VARIANTS)('%s', (_name, Card) => {
  it('badges an agent poster with the shared label', () => {
    render(<Card gig={gig(true)} />)
    expect(screen.getByText(AGENT_BADGE_LABEL)).toBeTruthy()
  })

  it('shows no agent badge for a human poster', () => {
    render(<Card gig={gig(false)} />)
    expect(screen.queryByText(AGENT_BADGE_LABEL)).toBeNull()
  })
})
