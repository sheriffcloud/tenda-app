/**
 * /wallet/intents/[id] — the page a reader watches their money settle on.
 *
 * The screen had no tests, which is how it kept a hardcoded naira sign
 * through every currency the product settles in. The assertion here is the
 * one that catches that class: the figure is drawn in the INTENT's currency,
 * not in whichever one happened to be typed into the JSX.
 */
import { render, screen, waitFor } from '@testing-library/react-native'
import type { FiatIntentDetail } from '@tenda/shared'

// The fn is created INSIDE the factory and reached through the imported
// module afterwards. `jest.mock` factories are hoisted above `const`
// declarations, so a factory that captures an outer `const mockFn = jest.fn()`
// captures `undefined` — the mock then registers but every call site sees a
// missing function, and this screen's catch-all swallows the TypeError. That
// is exactly how it presented: the mock factory ran, the effect ran, and the
// request was never made.
jest.mock('@/api/client', () => ({
  api: { fiat: { intent: jest.fn(), cancelIntent: jest.fn() } },
}))
jest.mock('expo-router', () => {
  // Same shape the wallet-screen test uses: run the focus callback through a
  // real effect keyed on the callback, so the screen's `useCallback` identity
  // drives it exactly as expo-router would.
  const React = require('react')
  return {
    useRouter: () => ({ back: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'int-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  }
})
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { default: '#ddd' },
        content: { primary: '#111', secondary: '#555' },
        feedback: { success: { base: '#0a0' }, danger: { base: '#a00' } },
        brand: { primary: '#00a' },
      },
    },
  }),
}))
jest.mock('@/theme/tokens', () => ({ spacing: { md: 16, lg: 24 } }))
jest.mock('lucide-react-native', () => ({ CheckCircle2: () => null, Clock: () => null, XCircle: () => null }))
jest.mock('@/components/feedback/LoadingScreen', () => {
  const { Text } = require('react-native')
  return { LoadingScreen: () => <Text>LOADING</Text> }
})
jest.mock('@/components/ui', () => {
  const { View, Text, Pressable } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children }: { children: React.ReactNode }) => (
      <Pressable accessibilityRole="button"><Text>{children}</Text></Pressable>
    ),
    ConfirmDialog: () => null,
    showToast: jest.fn(),
  }
})

import { api } from '@/api/client'
import FiatIntentScreen from '../intents/[id]'

const mockIntentGet = api.fiat.intent as jest.Mock

const detail = (over: Partial<FiatIntentDetail> = {}): FiatIntentDetail =>
  ({
    id: 'int-1',
    direction: 'offramp',
    status: 'awaiting_user',
    provider: 'rail-x',
    fiat_currency: 'NGN',
    fiat_amount: '75000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '50000000',
    rate: '1500.0000000000',
    fee_amount: '250.0000',
    kyc_required: false,
    kyc_url: null,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    instruction: null,
    created_at: '2026-08-18T09:00:00.000Z',
    ...over,
  }) as FiatIntentDetail

beforeEach(() => {
  jest.clearAllMocks()
})

test('draws the amount in the intent’s OWN currency, not a hardcoded one', async () => {
  mockIntentGet.mockResolvedValue(detail({ fiat_currency: 'KES', fiat_amount: '6450.0000' }))
  render(<FiatIntentScreen />)
  await waitFor(() => expect(screen.getByText(/Ksh\s?6,450/)).toBeTruthy())
  // The sign that was there before, for every currency.
  expect(screen.queryByText(/₦/)).toBeNull()
})

test('still draws naira for a naira intent', async () => {
  mockIntentGet.mockResolvedValue(detail())
  render(<FiatIntentScreen />)
  await waitFor(() => expect(screen.getByText(/₦75,000/)).toBeTruthy())
})

test('says plainly when the transaction is gone', async () => {
  const { ApiClientError } = jest.requireActual('@tenda/shared')
  mockIntentGet.mockRejectedValue(new ApiClientError(404, 'Not Found', 'gone', 'NOT_FOUND'))
  render(<FiatIntentScreen />)
  await waitFor(() => expect(screen.getByText(/no longer exists/)).toBeTruthy())
})
