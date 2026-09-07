/**
 * NoLinkedWalletNotice — the "no verified wallet" CTA. Verifies the default and
 * custom message render and the button routes to Settings → Linked wallets.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { surface: { inset: '#eee' }, content: { secondary: '#555' } } } }),
}))
jest.mock('@/theme/tokens', () => ({ spacing: { sm: 8, md: 16 } }))
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}><Text>{children}</Text></Pressable>
    ),
  }
})

import { NoLinkedWalletNotice } from '../NoLinkedWalletNotice'

beforeEach(() => mockPush.mockReset())

test('renders the default message and routes to linked wallets', () => {
  render(<NoLinkedWalletNotice />)
  expect(screen.getByText('Link a wallet to trade crypto.')).toBeTruthy()
  fireEvent.press(screen.getByText('Link a wallet'))
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
})

test('renders a custom context message', () => {
  render(<NoLinkedWalletNotice message="Link a wallet to post an offer." />)
  expect(screen.getByText('Link a wallet to post an offer.')).toBeTruthy()
})
