/**
 * Get-started screen (Stage 9C). Exercises control flow, not pixels: the
 * method options render, Google runs verify → routes, a cancelled Google
 * sign-in is silent, and phone/email/wallet push to their respective routes
 * (the contact step is now its own `continue-with` route). Native/UI deps are
 * stubbed. (jest hoists mock factories above imports, so factory-referenced
 * vars are `mock`-prefixed.)
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }))
// Post-login resets the stack; afterAuth calls it with profileComplete.
const mockAuthReset = jest.fn()
jest.mock('@/lib/post-auth-nav', () => ({ usePostAuthReset: () => mockAuthReset }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { primary: '#000', secondary: '#333' }, brand: { primary: '#00f' } } } }),
}))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    BrandLogo: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: (...a: unknown[]) => mockShowToast(...a),
  }
})

const mockSignInWithVerify = jest.fn(async () => ({ isNew: true }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ signInWithVerify: mockSignInWithVerify }),
    { getState: () => ({ profileComplete: false }) },
  ),
}))

jest.mock('@/api/client', () => ({ ApiClientError: class extends Error {} }))

const mockSignInWithGoogle = jest.fn()
jest.mock('@/lib/google-signin', () => ({
  signInWithGoogle: () => mockSignInWithGoogle(),
  configureGoogleSignIn: jest.fn(),
  GoogleSignInError: class extends Error {
    reason: string
    constructor(reason: string) { super(reason); this.reason = reason }
  },
}))
const mockIsAppleAvailable = jest.fn(async () => false)
jest.mock('@/lib/apple-signin', () => ({
  signInWithApple: jest.fn(),
  isAppleAvailable: () => mockIsAppleAvailable(),
  AppleSignInError: class extends Error {},
}))

import GetStartedScreen from '@/app/(auth)/get-started'
import { GoogleSignInError } from '@/lib/google-signin'

beforeEach(() => {
  mockPush.mockReset(); mockReplace.mockReset(); mockAuthReset.mockReset(); mockShowToast.mockReset()
  mockSignInWithVerify.mockClear()
  mockSignInWithGoogle.mockReset()
  mockIsAppleAvailable.mockReset(); mockIsAppleAvailable.mockResolvedValue(false)
})

test('renders the contact + social options', async () => {
  render(<GetStartedScreen />)
  await waitFor(() => expect(screen.getByText('Continue with Google')).toBeTruthy())
  expect(screen.getByText('Continue with phone')).toBeTruthy()
  expect(screen.getByText('Continue with email')).toBeTruthy()
  expect(screen.getByText('Sign in with a wallet')).toBeTruthy()
})

test('Apple option is hidden when the platform has no Apple sign-in', async () => {
  render(<GetStartedScreen />)
  await waitFor(() => expect(screen.getByText('Continue with Google')).toBeTruthy())
  expect(screen.queryByText('Continue with Apple')).toBeNull()
})

test('Apple option appears when available', async () => {
  mockIsAppleAvailable.mockResolvedValue(true)
  render(<GetStartedScreen />)
  await waitFor(() => expect(screen.getByText('Continue with Apple')).toBeTruthy())
})

test('Google: verifies the id_token then routes', async () => {
  mockSignInWithGoogle.mockResolvedValue('id-tok')
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Continue with Google'))
  await waitFor(() =>
    expect(mockSignInWithVerify).toHaveBeenCalledWith({ method: 'google', id_token: 'id-tok' }),
  )
  expect(mockAuthReset).toHaveBeenCalledWith(false) // profileComplete=false
})

test('Google cancellation is silent, no toast, no nav', async () => {
  mockSignInWithGoogle.mockRejectedValue(new GoogleSignInError('cancelled', 'user cancelled'))
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Continue with Google'))
  await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled())
  expect(mockShowToast).not.toHaveBeenCalled()
  expect(mockAuthReset).not.toHaveBeenCalled()
})

test('Google failure surfaces an error toast', async () => {
  mockSignInWithGoogle.mockRejectedValue(new Error('boom'))
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Continue with Google'))
  await waitFor(() => expect(mockShowToast).toHaveBeenCalled())
  expect(mockAuthReset).not.toHaveBeenCalled()
})

test('phone pushes to the contact route', async () => {
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Continue with phone'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/continue-with', params: { method: 'phone' } })
})

test('email pushes to the contact route', async () => {
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Continue with email'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/continue-with', params: { method: 'email' } })
})

test('wallet pushes to connect-wallet', async () => {
  render(<GetStartedScreen />)
  fireEvent.press(screen.getByText('Sign in with a wallet'))
  expect(mockPush).toHaveBeenCalledWith('/(auth)/connect-wallet')
})
