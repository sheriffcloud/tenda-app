/**
 * FeeSummary — the honest platform-fee breakdown. Covers both variants: gig
 * (poster escrows → worker net) and exchange (seller locks → BUYER net). The
 * exchange variant is the #7 fix: the P2P sell/create flow must disclose the
 * platform fee instead of reading as "free". Fee math is the real shared util.
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first -- Jest factories load RN after hoisting. */
import { render, screen } from '@testing-library/react-native'

let mockSeeker = false
jest.mock('@/stores/auth.store', () => ({ useIsSeeker: () => mockSeeker }))
jest.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: (sel: (s: unknown) => unknown) =>
    sel({ config: { fee_bps: 250, seeker_fee_bps: 100 }, fetch: jest.fn() }),
}))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
      content: { primary: '#111', secondary: '#555', tertiary: '#999' },
    } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Eyebrow', () => {
  const { Text } = require('react-native')
  return { Eyebrow: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/information', () => {
  const { Text, View } = require('react-native')
  return {
    ExpandableNotice: ({ content }: { content: { summary: string; description: string } }) => (
      <View>
        <Text>{content.summary}</Text>
        <Text>{content.description}</Text>
      </View>
    ),
  }
})

import { FeeSummary } from '../FeeSummary'

beforeEach(() => { mockSeeker = false })

test('exchange variant discloses the platform fee and the buyer net', () => {
  // 100 USDC (6dp) = 100_000_000; 2.5% fee = 2_500_000 (2.5); net = 97.5.
  render(<FeeSummary variant="exchange" asset="USDC_SOL" principalRaw="100000000" />)
  expect(screen.getByText('You lock')).toBeTruthy()
  expect(screen.getByText('Buyer receives')).toBeTruthy()
  expect(screen.getByText('Platform fee (2.50%)')).toBeTruthy()
  expect(screen.getByText('− 2.5 USDC')).toBeTruthy()
  expect(screen.getByText('97.5 USDC')).toBeTruthy()
  expect(screen.getByText('How platform fees are paid.')).toBeTruthy()
  // Note frames the fee as the buyer's, not a "free" trade.
  expect(screen.getByText(/platform fee is taken from the buyer's crypto/i)).toBeTruthy()
})

test('gig variant (default) keeps the poster/worker framing', () => {
  render(<FeeSummary asset="USDC_SOL" principalRaw="100000000" />)
  expect(screen.getByText('You escrow')).toBeTruthy()
  expect(screen.getByText('Worker receives')).toBeTruthy()
  expect(screen.getByText(/taken from the worker's payout/i)).toBeTruthy()
})

test('seeker fee tier (1%) is applied when the user is a seeker', () => {
  mockSeeker = true
  render(<FeeSummary variant="exchange" asset="USDC_SOL" principalRaw="100000000" />)
  expect(screen.getByText('Platform fee (1.00%)')).toBeTruthy()
  expect(screen.getByText('− 1 USDC')).toBeTruthy()
  expect(screen.getByText('99 USDC')).toBeTruthy()
})
