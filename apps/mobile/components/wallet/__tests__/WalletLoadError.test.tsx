/**
 * WalletLoadError, shown when the linked-wallet LOAD failed (distinct from
 * "no wallet linked"). Renders the failure prompt and fires the retry handler —
 * so a transient /v1/users/me blip no longer reads as "no wallet".
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#0a0', onPrimary: '#fff' },
        surface: { card: '#f6f6f6', background: '#fff' },
        border: { subtle: '#eee' },
        content: { primary: '#000', secondary: '#333' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ CloudOff: () => null }))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { WalletLoadError } from '@/components/wallet/WalletLoadError'

test('renders the load-failure prompt and fires the retry handler', () => {
  const onRetry = jest.fn()
  render(<WalletLoadError variant="wallets" onRetry={onRetry} />)
  expect(screen.getByText('Couldn’t load your wallets')).toBeTruthy()
  fireEvent.press(screen.getByText('Try again'))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('the balances variant says the WALLETS are fine and only the read failed', () => {
  // Wording matters here: this is shown to a user who HAS linked wallets, in
  // place of the `0.00` the screen used to assert over an unloaded registry.
  const onRetry = jest.fn()
  render(<WalletLoadError variant="balances" onRetry={onRetry} />)

  expect(screen.getByText('Couldn’t load your balances')).toBeTruthy()
  expect(screen.queryByText('Couldn’t load your wallets')).toBeNull()
  fireEvent.press(screen.getByText('Try again'))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('each variant labels its retry distinctly for screen readers', () => {
  const { rerender } = render(<WalletLoadError variant="wallets" onRetry={jest.fn()} />)
  expect(screen.getByLabelText('Retry loading wallets')).toBeTruthy()

  rerender(<WalletLoadError variant="balances" onRetry={jest.fn()} />)
  expect(screen.getByLabelText('Retry loading balances')).toBeTruthy()
})
