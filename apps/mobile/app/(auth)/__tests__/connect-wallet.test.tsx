/**
 * Connect-wallet screen (Stage 3). The button opens the shared WalletPicker;
 * selecting an adapter runs signInWithWallet and routes to home vs onboarding
 * by profile completeness. Decline and typed errors render the ErrorState.
 *
 * Native/styling deps (unistyles, expo-image, lucide) and the UI kit are
 * stubbed, this test exercises the screen's control flow, not its pixels.
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }))

// Post-login navigation resets the stack (so back can't return to auth); the
// screen calls the hook's returned fn with profileComplete.
const mockReset = jest.fn()
jest.mock('@/lib/post-auth-nav', () => ({ usePostAuthReset: () => mockReset }))

jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primarySurface: '#eee', primary: '#00f', onPrimary: '#fff' },
        content: { primary: '#000', secondary: '#333', tertiary: '#777' },
      },
    },
  }),
}))

jest.mock('@/components/ui/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('@/components/ui/Header', () => ({ Header: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text }
})
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})
jest.mock('@/components/feedback/ErrorState', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ErrorState: ({
      title,
      description,
      ctaLabel,
      onCtaPress,
      secondaryLabel,
      onSecondaryPress,
    }: {
      title: string
      description: string
      ctaLabel?: string
      onCtaPress?: () => void
      secondaryLabel?: string
      onSecondaryPress?: () => void
    }) => (
      <>
        <Text>{title}</Text>
        <Text>{description}</Text>
        {ctaLabel ? (
          <Pressable accessibilityRole="button" onPress={onCtaPress}>
            <Text>{ctaLabel}</Text>
          </Pressable>
        ) : null}
        {secondaryLabel ? (
          <Pressable accessibilityRole="button" onPress={onSecondaryPress}>
            <Text>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </>
    ),
  }
})

// WalletPicker stub: surfaces its `visible` state and offers a tappable entry
// that hands the screen a fake adapter.
const FAKE_ADAPTER = { id: 'solana-mwa', name: 'Solana Wallet' }
jest.mock('@/wallet/picker', () => {
  const { Pressable, Text } = require('react-native')
  return {
    WalletPicker: ({
      visible,
      onSelect,
    }: {
      visible: boolean
      onSelect: (a: typeof FAKE_ADAPTER) => void
    }) => (
      <>
        {visible ? <Text>picker-visible</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => onSelect(FAKE_ADAPTER)}>
          <Text>pick-wallet</Text>
        </Pressable>
      </>
    ),
  }
})

jest.mock('@/stores/auth.store', () => {
  const state: { signInWithWallet: jest.Mock; profileComplete: boolean } = {
    signInWithWallet: jest.fn(),
    profileComplete: true,
  }
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})

import ConnectWalletScreen from '@/app/(auth)/connect-wallet'
import { useAuthStore } from '@/stores/auth.store'
import { ApiClientError, WalletError } from '@tenda/shared'

const authState = useAuthStore.getState()
const signInMock = authState.signInWithWallet as jest.Mock

beforeEach(() => {
  authState.profileComplete = true
})

function selectWallet() {
  fireEvent.press(screen.getByText('pick-wallet'))
}

describe('ConnectWalletScreen', () => {
  it('opens the picker when Connect Wallet is pressed', () => {
    render(<ConnectWalletScreen />)
    expect(screen.queryByText('picker-visible')).toBeNull()
    fireEvent.press(screen.getByText('Connect Wallet'))
    expect(screen.getByText('picker-visible')).toBeTruthy()
  })

  it('signs in (adapter only, no signup bootstrap) and routes to home for a complete profile', async () => {
    signInMock.mockResolvedValue(true)
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith(FAKE_ADAPTER))
    expect(signInMock.mock.calls[0]).toHaveLength(1)
    expect(mockReset).toHaveBeenCalledWith(true)
  })

  it('routes to profile-setup when the profile is incomplete', async () => {
    signInMock.mockResolvedValue(true)
    authState.profileComplete = false
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith(false))
  })

  it('shows a cancelled state when the user declines', async () => {
    signInMock.mockResolvedValue(false)
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText('Connection cancelled')).toBeTruthy())
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('classifies a no_wallet WalletError with a Get Phantom action', async () => {
    signInMock.mockRejectedValue(new WalletError('no_wallet', 'none'))
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText('No wallet found')).toBeTruthy())
    expect(screen.getByText('Get Phantom')).toBeTruthy()
  })

  it('classifies a 401 ApiClientError as a sign-in failure', async () => {
    signInMock.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'unauthorized'))
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText('Sign-in failed')).toBeTruthy())
  })

  it('steers an unlinked wallet (WALLET_NOT_LINKED) to get-started', async () => {
    signInMock.mockRejectedValue(
      new ApiClientError(404, 'Not Found', 'not linked', 'WALLET_NOT_LINKED'),
    )
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText('Wallet not linked')).toBeTruthy())
    // The secondary CTA routes to the multi-method entry, not a dead end.
    fireEvent.press(screen.getByText('Get started'))
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/get-started')
  })

  it.each([
    ['declined', new WalletError('declined', 'x'), 'Connection cancelled'],
    ['network', new WalletError('network', 'x'), 'No connection'],
    ['unknown', new WalletError('unknown', 'x'), 'Something went wrong'],
    ['network-message Error', new Error('request timeout'), 'No connection'],
    ['opaque Error', new Error('weird'), 'Something went wrong'],
  ])('classifies a %s error', async (_label, err, title) => {
    signInMock.mockRejectedValue(err)
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy())
  })

  it('clears the error and returns to the hero on "Try again"', async () => {
    signInMock.mockRejectedValue(new WalletError('unknown', 'x'))
    render(<ConnectWalletScreen />)
    selectWallet()
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeTruthy())
    fireEvent.press(screen.getByText('Try again'))
    expect(screen.queryByText('Something went wrong')).toBeNull()
    expect(screen.getByText('Connect Wallet')).toBeTruthy()
  })
})
