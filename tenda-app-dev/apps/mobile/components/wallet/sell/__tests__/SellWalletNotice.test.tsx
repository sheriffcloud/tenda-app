/**
 * The sell surface's precondition (#60). What it says, and — the half that was
 * wrong — WHEN it is allowed to say the one thing about the reader.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import {
  SELL_CHAINS_UNAVAILABLE,
  SELL_NO_WALLET_OFFER,
  SELL_WALLET_CHECKING,
  SELL_WALLET_LOAD_FAILED,
  type WalletSectionState,
} from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { surface: { inset: '#eee' }, content: { secondary: '#555' } } },
  }),
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

import { SellWalletNotice } from '../SellWalletNotice'

function setup(section: WalletSectionState) {
  const onRetryWallets = jest.fn()
  const onRetryChains = jest.fn()
  render(
    <SellWalletNotice
      section={section}
      noWalletMessage={SELL_NO_WALLET_OFFER}
      onRetryWallets={onRetryWallets}
      onRetryChains={onRetryChains}
    />,
  )
  return { onRetryWallets, onRetryChains }
}

beforeEach(() => jest.clearAllMocks())

it('a settled absence asks for a wallet and routes there when pressed', () => {
  setup('no-wallet')
  expect(screen.getByText(SELL_NO_WALLET_OFFER)).toBeTruthy()
  expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Link a wallet'))
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
})

it('a usable surface says nothing — the picker takes over', () => {
  setup('ready')
  expect(screen.queryByText(SELL_NO_WALLET_OFFER)).toBeNull()
})

it('while it is still looking it says SO, and offers nothing to press', () => {
  // This surface used to say "link a wallet" here, to a reader who may well
  // have one — and on a cold deep-link it said it forever.
  setup('loading')
  expect(screen.getByText(SELL_WALLET_CHECKING)).toBeTruthy()
  expect(screen.queryByText(SELL_NO_WALLET_OFFER)).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it('a failed WALLETS load retries the wallets, and only the wallets', () => {
  const { onRetryWallets, onRetryChains } = setup('wallets-error')
  expect(screen.getByText(SELL_WALLET_LOAD_FAILED)).toBeTruthy()
  fireEvent.press(screen.getByText('Try again'))
  expect(onRetryWallets).toHaveBeenCalledTimes(1)
  expect(onRetryChains).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

it('a failed CHAINS load retries the chains — a single retry would strand it', () => {
  const { onRetryWallets, onRetryChains } = setup('balances-unavailable')
  expect(screen.getByText(SELL_CHAINS_UNAVAILABLE)).toBeTruthy()
  fireEvent.press(screen.getByText('Try again'))
  expect(onRetryChains).toHaveBeenCalledTimes(1)
  expect(onRetryWallets).not.toHaveBeenCalled()
})
