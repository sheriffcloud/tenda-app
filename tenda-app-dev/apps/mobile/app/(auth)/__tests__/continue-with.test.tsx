/**
 * Continue-with contact step (Stage 9C). The phone/email identifier screen,
 * now its own route so back pops to get-started. Exercises control flow:
 * channel copy/placeholder from the `method` param (defaulting to phone),
 * client-side validation (real @tenda/shared validators) surfaced as an inline
 * error + disabled button, the challenge→verify-code hop, and error surfacing.
 * Native/UI deps stubbed. (Title lives in the mocked Header, so channel is
 * detected via the body placeholder.)
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import type { ChallengeBody } from '@tenda/shared'

const mockPush = jest.fn()
const mockParams: { method?: string; mode?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { primary: '#000', secondary: '#333' }, feedback: { danger: { base: '#f00' } } } } }),
}))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress, loading, disabled }: { children: React.ReactNode; onPress?: () => void; loading?: boolean; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: (...a: unknown[]) => mockShowToast(...a),
  }
})
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return {
    Input: ({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) => (
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} />
    ),
  }
})

const mockChallenge = jest.fn(async (_b: ChallengeBody) => ({ expires_in: 600 }))
jest.mock('@/api/client', () => ({
  api: { auth: { challenge: (b: ChallengeBody) => mockChallenge(b) } },
  ApiClientError: class extends Error {},
}))

import ContinueWithScreen from '@/app/(auth)/continue-with'

beforeEach(() => {
  mockPush.mockReset(); mockShowToast.mockReset()
  mockChallenge.mockReset(); mockChallenge.mockResolvedValue({ expires_in: 600 })
  delete mockParams.method
  delete mockParams.mode
})

test('phone: renders the phone placeholder and lede', () => {
  mockParams.method = 'phone'
  render(<ContinueWithScreen />)
  expect(screen.getByPlaceholderText('+2348012345678')).toBeTruthy()
  expect(screen.getByText('We’ll text you a 6-digit code to confirm it’s you.')).toBeTruthy()
})

test('email: renders the email placeholder and lede', () => {
  mockParams.method = 'email'
  render(<ContinueWithScreen />)
  expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
  expect(screen.getByText('We’ll email you a 6-digit code to confirm it’s you.')).toBeTruthy()
})

test('defaults to the phone channel when the method param is absent or invalid', () => {
  mockParams.method = 'garbage'
  render(<ContinueWithScreen />)
  expect(screen.getByPlaceholderText('+2348012345678')).toBeTruthy()
})

test('phone: a valid E.164 number challenges then routes to verify-code', async () => {
  mockParams.method = 'phone'
  render(<ContinueWithScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('+2348012345678'), '+2348012345678')
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() =>
    expect(mockChallenge).toHaveBeenCalledWith({ method: 'phone', identifier: '+2348012345678' }),
  )
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(auth)/verify-code',
    params: { channel: 'phone', identifier: '+2348012345678' },
  })
})

test('phone: an invalid number shows an inline error and never challenges', async () => {
  mockParams.method = 'phone'
  render(<ContinueWithScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('+2348012345678'), '08012345678') // not E.164
  expect(screen.getByText('Use international format, e.g. +2348012345678')).toBeTruthy()
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() => expect(screen.getByText('Send code')).toBeTruthy())
  expect(mockChallenge).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

test('email: a valid address is normalized, challenged, then routes', async () => {
  mockParams.method = 'email'
  render(<ContinueWithScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), '  You@Example.com ')
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() =>
    expect(mockChallenge).toHaveBeenCalledWith({ method: 'email', identifier: 'you@example.com' }),
  )
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(auth)/verify-code',
    params: { channel: 'email', identifier: 'you@example.com' },
  })
})

test('email: an empty value never challenges (button disabled, no error shown)', async () => {
  mockParams.method = 'email'
  render(<ContinueWithScreen />)
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() => expect(screen.getByText('Send code')).toBeTruthy())
  expect(mockChallenge).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

test('link mode: shows the add-to-account copy and forwards mode to verify-code', async () => {
  mockParams.method = 'email'
  mockParams.mode = 'link'
  render(<ContinueWithScreen />)
  // Link-specific title + lede (vs the sign-in copy).
  expect(screen.getByText('Add your email')).toBeTruthy()
  expect(screen.getByText('We’ll email you a 6-digit code to add this address to your account.')).toBeTruthy()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'me@example.com')
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() => expect(mockChallenge).toHaveBeenCalledWith({ method: 'email', identifier: 'me@example.com' }))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(auth)/verify-code',
    params: { channel: 'email', identifier: 'me@example.com', mode: 'link' },
  })
})

test('a failed challenge surfaces an error toast and does not navigate', async () => {
  mockParams.method = 'phone'
  mockChallenge.mockRejectedValue(new Error('network down'))
  render(<ContinueWithScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('+2348012345678'), '+2348012345678')
  fireEvent.press(screen.getByText('Send code'))
  await waitFor(() => expect(mockShowToast).toHaveBeenCalled())
  expect(mockPush).not.toHaveBeenCalled()
})
