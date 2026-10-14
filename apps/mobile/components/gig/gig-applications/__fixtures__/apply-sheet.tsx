/**
 * Shared harness for the two ApplySheet suites — the pitch half in
 * `ApplySheet.test.tsx`, the wallet half in `ApplySheet.wallet.test.tsx`.
 *
 * Every jest.mock lives here rather than in the test files: they are 120-odd
 * lines of doubles that both halves need in full, and a hand-maintained second
 * copy is how the two halves quietly start testing different sheets. It also
 * kept the wallet file over the size limit.
 *
 * Test files MUST take `ApplySheet` from this module (re-exported below) —
 * importing it directly would race the mock registration, since hoisting is
 * per-module. Same shape as `app/settings/__fixtures__/linked-wallets-harness`.
 */
import type { LinkedWallet } from '@tenda/shared'

/**
 * The auth state the suites drive the sheet with, built INSIDE the factory and
 * read back through `getState` below.
 *
 * It cannot be a module-level const: babel-plugin-jest-hoist relocates any
 * declaration a factory references above the `jest.mock` call and leaves the
 * paired `exports.X =` behind, so importing suites would see `undefined`
 * (the trap `linked-wallets-harness` documents).
 *
 * `getState` is mocked as well as the hook because the sheet reads the status
 * imperatively — that is what stops its load effect re-firing on the very
 * state changes it causes.
 */
jest.mock('@/stores/auth.store', () => {
  const state = {
    wallets: [] as LinkedWallet[],
    walletsStatus: 'ready',
    refreshMe: jest.fn(),
  }
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})

// The picker is covered by its own suite; here it is a keyboard for the CHOICE,
// so the sheet's own derivation — which wallet starts selected, whether
// submitting is possible at all — is what the assertions land on.
jest.mock('../ApplyWalletPicker', () => {
  const { Text, View } = require('react-native')
  return {
    ApplyWalletPicker: ({
      status,
      options,
      selected,
      onSelect,
      onRetry,
    }: {
      status: WalletsStatus
      options: { address: string }[]
      selected: string | null
      onSelect: (a: string) => void
      onRetry: () => void
    }) => (
      <View>
        <Text>{`picker:${status}:${String(selected)}`}</Text>
        <Text onPress={onRetry}>retry</Text>
        {options.map((o) => (
          <Text key={o.address} onPress={() => onSelect(o.address)}>{`pick-${o.address}`}</Text>
        ))}
      </View>
    ),
  }
})

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#111', secondary: '#666' },
        feedback: { warning: { surface: '#fe8', base: '#a60' } },
      },
    },
  }),
}))

jest.mock('@/components/ui', () => {
  const { Text, TextInput, View, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    // Only renders its children when visible, as the real sheet does.
    BottomSheet: ({
      visible,
      title,
      children,
    }: {
      visible: boolean
      title: string
      children: React.ReactNode
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
        </View>
      ) : null,
    Input: ({
      label,
      value,
      onChangeText,
      maxLength,
    }: {
      label: string
      value: string
      onChangeText: (v: string) => void
      maxLength?: number
    }) => (
      <View>
        <Text>{`${label}:max=${String(maxLength)}`}</Text>
        <TextInput testID="pitch" value={value} onChangeText={onChangeText} />
      </View>
    ),
    // A real Pressable honouring `disabled`, because "the submit is disabled"
    // is a claim these suites make — a bare <Text onPress> would fire anyway
    // and the assertion would pass against a broken sheet.
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: React.ReactNode
      onPress?: () => void
      disabled?: boolean
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled === true }}
      >
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})

import { ApplySheet } from '../ApplySheet'

export { ApplySheet }
import { useAuthStore } from '@/stores/auth.store'
import type { WalletsStatus } from '@/stores/wallet-sync'

export const CHAIN = 'eip155:84532'
export const PRIMARY = '0xPrimary1'
export const SECOND = '0xSecond22'

export function wallet(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: PRIMARY,
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

export const authState = useAuthStore.getState()
export const refreshMeMock = authState.refreshMe as jest.Mock

// State only — `clearMocks` in jest.config already clears `refreshMe`. The
// primary is deliberately NOT first: with it first, "preselects the primary"
// and "preselects the first row" are the same answer and the assertion proves
// nothing.
beforeEach(() => {
  authState.walletsStatus = 'ready'
  authState.wallets = [wallet({ address: SECOND }), wallet({ address: PRIMARY, is_primary: true })]
})
