/**
 * The composer's wallet precondition (#59). Two things matter here and the
 * second is the one that was wrong before: WHAT it says, and WHEN it is
 * allowed to say anything at all.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import {
  COMPOSER_WALLET_BODY,
  COMPOSER_WALLET_TITLE,
  COMPOSER_WALLET_UNAVAILABLE_TITLE,
  type ComposerWalletGate,
} from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        feedback: { warning: { base: '#a60', surface: '#fff8e1' } },
        content: { secondary: '#555' },
      },
    },
  }),
}))
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}><Text>{children}</Text></Pressable>
    ),
  }
})

import { ComposerWalletNotice } from '../ComposerWalletNotice'

function setup(gate: ComposerWalletGate) {
  const onRetry = jest.fn()
  render(<ComposerWalletNotice gate={gate} onRetry={onRetry} />)
  return onRetry
}

beforeEach(() => jest.clearAllMocks())

it('tells a settled wallet-less account BEFORE it fills anything', () => {
  setup('needs_wallet')
  expect(screen.getByText(COMPOSER_WALLET_TITLE)).toBeTruthy()
  expect(screen.getByText(COMPOSER_WALLET_BODY)).toBeTruthy()
})

it('OFFERS the way out rather than taking it', () => {
  // An automatic push is what lost the filled form; this one waits to be asked.
  setup('needs_wallet')
  expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Link a wallet'))
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
})

it('says nothing to an account that can sign', () => {
  setup('ok')
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).toBeNull()
})

it('says nothing while the answer is unknown', () => {
  // Covers both an unsettled wallet list and a registry that has not landed —
  // in neither do we know enough to tell someone they have no wallet.
  setup('unknown')
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).toBeNull()
  expect(screen.queryByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).toBeNull()
})

it('a FAILED load says so and retries in place — never "link a wallet"', () => {
  const onRetry = setup('unavailable')
  expect(screen.getByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).toBeTruthy()
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).toBeNull()
  fireEvent.press(screen.getByText('Try again'))
  expect(onRetry).toHaveBeenCalledTimes(1)
  // Retrying must not also navigate: the reader has not been shown to need to.
  expect(mockPush).not.toHaveBeenCalled()
})
