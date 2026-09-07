/**
 * Shared harness for the linked-wallets suites.
 *
 * Every jest.mock lives here rather than in the test files: the mocks are ~130
 * lines and both suites need all of them, so duplicating them would be the
 * bigger sin. Test files MUST take `LinkedWalletsScreen` from this module
 * (re-exported below) — importing the screen directly would race the mock
 * registration, since hoisting is per-module.
 *
 * The screen itself (Stage 4, EVM link parity). "Add another wallet"
 * opens the shared WalletPicker; selecting an adapter runs the store's
 * `linkWallet` action and surfaces the outcome via toasts. On success it
 * returns to this screen (the wallet's `tenda://` auto-return may have popped
 * it). Covers success, decline, no-wallet, and server-error branches.
 */
import { fireEvent, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  // Fire the focus callback once so refreshMe runs on mount.
  useFocusEffect: (cb: () => void) => cb(),
}))

export const mockReturnToLinkedWallets = jest.fn()
jest.mock('@/lib/post-auth-nav', () => ({
  useReturnToLinkedWallets: () => mockReturnToLinkedWallets,
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { secondary: '#333', tertiary: '#777' },
        border: { subtle: '#ccc' },
        brand: { primary: '#00f', primarySurface: '#eee' },
        feedback: { danger: { base: '#f00', surface: '#fee' } },
      },
    },
  }),
}))

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Text: Text,
    BottomSheet: ({
      children,
      visible,
      onClose,
    }: {
      children: React.ReactNode
      visible: boolean
      onClose: () => void
    }) =>
      visible ? (
        <View>
          {children}
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text>sheet-close</Text>
          </Pressable>
        </View>
      ) : null,
    ConfirmDialog: ({
      visible,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      hideCancel,
      onConfirm,
      onCancel,
    }: {
      visible: boolean
      confirmLabel?: string
      cancelLabel?: string
      hideCancel?: boolean
      onConfirm: () => void
      onCancel: () => void
    }) =>
      visible ? (
        <View>
          {hideCancel === true ? null : (
            <Pressable accessibilityRole="button" onPress={onCancel}>
              <Text>{cancelLabel}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onConfirm}>
            <Text>{confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: jest.fn(),
  }
})

jest.mock('@/components/onboarding/WalletCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    WalletCard: ({
      wallet,
      onManage,
    }: {
      wallet: { address: string }
      onManage: () => void
    }) => (
      <Pressable accessibilityRole="button" onPress={onManage}>
        <Text>{`manage-${wallet.address}`}</Text>
      </Pressable>
    ),
  }
})

jest.mock('@/wallet/picker', () => {
  const { Pressable, Text } = require('react-native')
  return {
    WalletPicker: ({
      visible,
      onSelect,
      onClose,
    }: {
      visible: boolean
      onSelect: (a: typeof mockAdapter) => void
      onClose: () => void
    }) => (
      <>
        {visible ? <Text>picker-visible</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => onSelect(mockAdapter)}>
          <Text>pick-wallet</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text>picker-close</Text>
        </Pressable>
      </>
    ),
  }
})

jest.mock('@/api/client', () => {
  // The REAL shared class — sources narrow `instanceof ApiClientError` against it.
  const { ApiClientError } = jest.requireActual('@tenda/shared')
  return {
    api: { auth: { setPrimaryWallet: jest.fn(), unlinkWallet: jest.fn() } },
    ApiClientError,
  }
})

jest.mock('@/stores/auth.store', () => {
  const state: { wallets: LinkedWallet[]; refreshMe: jest.Mock; linkWallet: jest.Mock } = {
    wallets: [],
    refreshMe: jest.fn(async () => {}),
    linkWallet: jest.fn(),
  }
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})

import LinkedWalletsScreen from '@/app/settings/linked-wallets'

export { LinkedWalletsScreen }
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import type { LinkedWallet } from '@tenda/shared'
import { showToast } from '@/components/ui'

export const mockShowToast = showToast as jest.Mock
export const setPrimaryMock = api.auth.setPrimaryWallet as jest.Mock
export const unlinkMock = api.auth.unlinkWallet as jest.Mock
export const authState = useAuthStore.getState()
export const linkMock = authState.linkWallet as jest.Mock

beforeEach(() => {
  authState.wallets = []
  linkMock.mockReset()
  mockReturnToLinkedWallets.mockReset()
})

export function openPickerAndSelect() {
  fireEvent.press(screen.getByText('Add another wallet'))
  fireEvent.press(screen.getByText('pick-wallet'))
}

export const PRIMARY: LinkedWallet = {
  chain_ns: 'solana',
  address: '0xPrimary',
  is_primary: true,
  verified_at: '2026-01-01T00:00:00Z',
}

export const SECONDARY: LinkedWallet = {
  chain_ns: 'eip155',
  address: '0xSecondary',
  is_primary: false,
  verified_at: '2026-01-01T00:00:00Z',
}

/**
 * The single adapter the mocked picker offers.
 *
 * The `mock` prefix is load-bearing, not styling. A fixture referenced inside a
 * jest.mock factory has its declaration relocated above that call by
 * babel-plugin-jest-hoist, and for a non-`mock` name the paired `exports.X =`
 * assignment is left behind — the factory reads the value fine while every
 * importing suite sees `undefined`. Renaming this from FAKE_ADAPTER is what
 * made it visible to the test files at all.
 */
export const mockAdapter = { id: 'metamask', name: 'MetaMask' }
