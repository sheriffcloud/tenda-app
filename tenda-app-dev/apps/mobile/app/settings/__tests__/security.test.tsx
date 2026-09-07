/**
 * Sign-in & security screen. Lists email/phone/wallets and routes "add"
 * affordances into the unified contact OTP flow (continue-with, link mode).
 * Asserts: a verified email/phone shows its value; a missing one shows an Add
 * row that navigates with the right params; on focus it refreshes the methods.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { IdentityMethodWire } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  // Run the focus effect body immediately.
  useFocusEffect: (cb: () => void) => cb(),
}))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { content: { primary: '#000', secondary: '#333', tertiary: '#777' }, feedback: { success: { base: '#0a0' } } } },
  }),
}))
jest.mock('lucide-react-native', () => ({
  BadgeCheck: () => null, Mail: () => null, Phone: () => null, Wallet: () => null,
}))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  }
})
jest.mock('@/components/ui/SectionLabel', () => ({ SectionLabel: () => null }))
jest.mock('@/components/settings/SettingsRow', () => {
  const { Pressable, Text } = require('react-native')
  return {
    SettingsGroup: ({ children }: { children: React.ReactNode }) => children,
    SettingsRow: ({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
        {value !== undefined ? <Text>{value}</Text> : null}
      </Pressable>
    ),
  }
})

const mockLoadMethods = jest.fn()
const mockRefreshMe = jest.fn()
let mockState: { identities: IdentityMethodWire[]; wallets: unknown[] } = { identities: [], wallets: [] }
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ ...mockState, loadMethods: mockLoadMethods, refreshMe: mockRefreshMe }),
}))

import SecuritySettingsScreen from '@/app/settings/security'

beforeEach(() => {
  mockPush.mockReset(); mockLoadMethods.mockReset(); mockRefreshMe.mockReset()
  mockState = { identities: [], wallets: [] }
})

test('refreshes methods + wallets on focus', () => {
  render(<SecuritySettingsScreen />)
  expect(mockLoadMethods).toHaveBeenCalled()
  expect(mockRefreshMe).toHaveBeenCalled()
})

test('a verified email shows its address (no Add email row)', () => {
  mockState.identities = [{ kind: 'email', identifier: 'me@x.io', email: 'me@x.io', verified: true }]
  render(<SecuritySettingsScreen />)
  expect(screen.getByText('me@x.io')).toBeTruthy()
  expect(screen.queryByText('Add email')).toBeNull()
})

test('an UNverified email never shows a verified badge, falls back to Add email', () => {
  // Defensive: the ✓ must reflect the real verified state (mirrors the phone row).
  mockState.identities = [{ kind: 'email', identifier: 'me@x.io', email: 'me@x.io', verified: false }]
  render(<SecuritySettingsScreen />)
  expect(screen.queryByText('me@x.io')).toBeNull()
  expect(screen.getByText('Add email')).toBeTruthy()
})

test('a missing email shows Add email and routes to continue-with link mode', () => {
  render(<SecuritySettingsScreen />)
  fireEvent.press(screen.getByText('Add email'))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(auth)/continue-with',
    params: { method: 'email', mode: 'link' },
  })
})

test('an unverified phone shows the Verify row and routes with the phone params', () => {
  mockState.identities = [{ kind: 'phone', identifier: '+2348000000000', email: null, verified: false }]
  render(<SecuritySettingsScreen />)
  fireEvent.press(screen.getByText('Verify phone number'))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(auth)/continue-with',
    params: { method: 'phone', mode: 'link' },
  })
})

test('a verified phone shows its number', () => {
  mockState.identities = [{ kind: 'phone', identifier: '+2348000000000', email: null, verified: true }]
  render(<SecuritySettingsScreen />)
  expect(screen.getByText('+2348000000000')).toBeTruthy()
})
