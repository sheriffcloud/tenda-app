/**
 * WalletEmptyState, shown when no wallet is linked. Renders the prompt and
 * routes to linked-wallets (replacing the old perpetual skeleton).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#0a0', primarySurface: '#efe', primaryBorder: '#cfc', onPrimary: '#fff' },
        surface: { background: '#fff' },
        content: { primary: '#000', secondary: '#333' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ Wallet: () => null }))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { WalletEmptyState } from '@/components/wallet/WalletEmptyState'

beforeEach(() => mockPush.mockReset())

test('renders the no-wallet prompt and routes to linked-wallets', () => {
  render(<WalletEmptyState />)
  expect(screen.getByText('No wallet linked yet')).toBeTruthy()
  fireEvent.press(screen.getByText('Link a wallet'))
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
})
