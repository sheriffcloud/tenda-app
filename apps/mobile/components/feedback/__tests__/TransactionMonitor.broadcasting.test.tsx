import { act, render, screen } from '@testing-library/react-native'
import { TRANSACTION_RESILIENCE } from '@tenda/shared'
import { TransactionMonitor } from '../TransactionMonitor'

let mockNetwork = { isConnected: true, isInternetReachable: true }
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => mockNetwork }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#00a' }, surface: { card: '#fff' },
        content: { secondary: '#555' },
        feedback: { success: { base: '#0a0' }, danger: { base: '#a00' } },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ CheckCircle: () => null, XCircle: () => null, Wallet: () => null }))
jest.mock('@/components/ui/Text', () => {
  // Jest factories cannot close over an imported native component before mock hoisting.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Button', () => ({ Button: () => null }))
jest.mock('@/wallet', () => ({
  abortPendingWalletRequest: jest.fn(), hasPendingWalletRequest: () => false,
  subscribePendingWalletRequest: () => () => {},
}))
jest.mock('@/hooks/escrow-sync', () => ({
  ESCROW_CONFIRM_DISMISS_MS: 800,
  useEscrowTransactionSync: () => ({ state: 'waiting', failure: '' }),
}))

const noop = () => {}
const renderBroadcast = () => render(
  <TransactionMonitor
    signature={null}
    phase="broadcasting"
    checkApplied={async () => false}
    onConfirmed={noop}
    onFailed={noop}
  />,
)

beforeEach(() => {
  mockNetwork = { isConnected: true, isInternetReachable: true }
})

test('confirms wallet approval and does not ask the user to approve again', () => {
  renderBroadcast()
  expect(screen.getByText('Submitting transaction…')).toBeTruthy()
  expect(screen.getByText('Your wallet approval was received.')).toBeTruthy()
  expect(screen.queryByText('Approve in your wallet')).toBeNull()
})

test('reports offline recovery without claiming failure', () => {
  mockNetwork = { isConnected: false, isInternetReachable: false }
  renderBroadcast()
  expect(screen.getByText(/reconnect to let Tenda check/i)).toBeTruthy()
  expect(screen.queryByText('Transaction issue')).toBeNull()
})

test('slow notice replaces the ordinary caption only after the shared threshold', () => {
  jest.useFakeTimers()
  try {
    renderBroadcast()
    expect(screen.queryByText(/taking longer than usual/i)).toBeNull()
    act(() => jest.advanceTimersByTime(TRANSACTION_RESILIENCE.slowOperationNoticeMs))
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})
