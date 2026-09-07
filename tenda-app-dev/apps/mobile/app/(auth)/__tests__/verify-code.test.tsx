/**
 * Verify-code screen (Stage 9C), generic OTP entry, two modes:
 *   - signin (default): auto-submit on 6 digits → signInWithVerify → reset stack.
 *   - link (Sign-in & security): → linkIdentity → toast + dismiss to security,
 *     WITHOUT touching the session. A blocked identity surfaces the Tier-0
 *     message and clears the field. Native/UI deps + OtpCodeField stubbed.
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import { ApiClientError, TIER0_MESSAGE } from '@tenda/shared'

// Mutable params so a single mock can flip between signin / link mode per test.
let mockParams: Record<string, string> = { channel: 'email', identifier: 'a@x.io' }
const mockReplace = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo }),
  useLocalSearchParams: () => mockParams,
}))
// Post-login resets the stack; the screen calls it with profileComplete.
const mockAuthReset = jest.fn()
jest.mock('@/lib/post-auth-nav', () => ({ usePostAuthReset: () => mockAuthReset }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { content: { primary: '#000', secondary: '#333' }, border: { default: '#ccc' } } },
  }),
}))

// OtpCodeField is unit-tested on its own; here it's a thin TextInput proxy.
jest.mock('@/components/auth/OtpCodeField', () => {
  const { TextInput } = require('react-native')
  return {
    OtpCodeField: ({ value, onChange, accessibilityLabel }: { value: string; onChange: (d: string) => void; accessibilityLabel?: string }) => (
      <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={onChange} />
    ),
  }
})

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: (...a: unknown[]) => mockShowToast(...a),
  }
})

const mockSignInWithVerify = jest.fn()
const mockLinkIdentity = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ signInWithVerify: mockSignInWithVerify, linkIdentity: mockLinkIdentity }),
    { getState: () => ({ profileComplete: false }) },
  ),
}))

jest.mock('@/api/client', () => {
  return { api: { auth: { challenge: jest.fn(async () => ({ expires_in: 600 })) } } }
})

import VerifyCodeScreen from '@/app/(auth)/verify-code'

beforeEach(() => {
  mockParams = { channel: 'email', identifier: 'a@x.io' }
  mockReplace.mockReset(); mockDismissTo.mockReset(); mockAuthReset.mockReset()
  mockShowToast.mockReset(); mockSignInWithVerify.mockReset(); mockLinkIdentity.mockReset()
})

test('signin: 6 digits auto-submit → verify → route to profile setup', async () => {
  mockSignInWithVerify.mockResolvedValue({ isNew: true })
  render(<VerifyCodeScreen />)
  fireEvent.changeText(screen.getByLabelText('Verification code'), '424242')
  await waitFor(() =>
    expect(mockSignInWithVerify).toHaveBeenCalledWith({ method: 'email', identifier: 'a@x.io', code: '424242' }),
  )
  expect(mockAuthReset).toHaveBeenCalledWith(false)
  expect(mockLinkIdentity).not.toHaveBeenCalled()
})

test('link: 6 digits → linkIdentity → toast + dismiss to security, no session reset', async () => {
  mockParams = { channel: 'email', identifier: 'a@x.io', mode: 'link' }
  mockLinkIdentity.mockResolvedValue(undefined)
  render(<VerifyCodeScreen />)
  fireEvent.changeText(screen.getByLabelText('Verification code'), '424242')
  await waitFor(() =>
    expect(mockLinkIdentity).toHaveBeenCalledWith({ method: 'email', identifier: 'a@x.io', code: '424242' }),
  )
  expect(mockShowToast).toHaveBeenCalledWith('success', 'Email verified')
  expect(mockDismissTo).toHaveBeenCalledWith('/settings/security')
  expect(mockSignInWithVerify).not.toHaveBeenCalled()
  expect(mockAuthReset).not.toHaveBeenCalled()
})

test('a blocked identity shows the Tier-0 message and does not route', async () => {
  mockSignInWithVerify.mockRejectedValue(new ApiClientError(409, 'Conflict', 'blocked', 'IDENTITY_ALREADY_LINKED'))
  render(<VerifyCodeScreen />)
  fireEvent.changeText(screen.getByLabelText('Verification code'), '111111')
  await waitFor(() =>
    expect(mockShowToast).toHaveBeenCalledWith('error', TIER0_MESSAGE.identity_already_linked),
  )
  expect(mockAuthReset).not.toHaveBeenCalled()
})

test('non-numeric input is stripped; under 6 digits does not submit', () => {
  render(<VerifyCodeScreen />)
  fireEvent.changeText(screen.getByLabelText('Verification code'), '12ab')
  expect(mockSignInWithVerify).not.toHaveBeenCalled()
})
