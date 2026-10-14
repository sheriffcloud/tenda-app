/**
 * Profile-setup screen. Regression anchor: the screen once bound an
 * "I'm looking to hire" toggle to is_seeker and PATCHed it, letting any user
 * self-assign the Seeker DEVICE fee tier. The toggle is gone and the PATCH
 * must never carry is_seeker (bootstrap lives in auth.store signInWithVerify).
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'

const mockAuthReset = jest.fn()
jest.mock('@/lib/post-auth-nav', () => ({ usePostAuthReset: () => mockAuthReset }))
jest.mock('@/lib/device', () => ({ getDeviceCountry: () => 'NG' }))
jest.mock('@/lib/upload', () => ({ uploadToCloudinary: jest.fn() }))
jest.mock('lucide-react-native', () => ({ Camera: () => null }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#333' },
        surface: { card: '#fff', background: '#fff' },
        border: { default: '#ccc', subtle: '#eee' },
      },
    },
  }),
}))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Spacer: () => null,
    Avatar: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: (...a: unknown[]) => mockShowToast(...a),
  }
})
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return {
    Input: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) => (
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} />
    ),
  }
})
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/form/CountryCityPicker', () => ({ CountryCityPicker: () => null }))
jest.mock('@/components/form/FilePicker', () => ({ pickAvatar: jest.fn(async () => null) }))

const mockUpdateMe = jest.fn()
jest.mock('@/api/client', () => ({ api: { users: { updateMe: (b: unknown) => mockUpdateMe(b) } } }))

const mockRefreshUser = jest.fn(async () => {})
const mockSetState = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (sel: (s: { user: null }) => unknown) => sel({ user: null }),
    { setState: (p: unknown) => mockSetState(p), getState: () => ({ refreshUser: mockRefreshUser }) },
  ),
}))

import ProfileSetupScreen from '@/app/(auth)/profile-setup'

beforeEach(() => {
  mockUpdateMe.mockReset()
  mockAuthReset.mockReset()
  mockShowToast.mockReset()
  mockSetState.mockReset()
})

function fillNamesAndFinish() {
  fireEvent.changeText(screen.getByLabelText('First name'), 'Ada')
  fireEvent.changeText(screen.getByLabelText('Last name'), 'Okafor')
  fireEvent.press(screen.getByRole('button', { name: 'Finish' }))
}

test('renders NO seeker/hire toggle — is_seeker is not a form preference', () => {
  render(<ProfileSetupScreen />)
  expect(screen.queryByText(/looking to hire/i)).toBeNull()
  expect(screen.queryByText('How will you use Tenda?')).toBeNull()
})

test('finish PATCHes names + device country and NEVER is_seeker, then resets to root', async () => {
  mockUpdateMe.mockResolvedValue({ profile_complete: true })
  render(<ProfileSetupScreen />)
  fillNamesAndFinish()

  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledTimes(1))
  const body = mockUpdateMe.mock.calls[0][0] as Record<string, unknown>
  expect(body).toMatchObject({ first_name: 'Ada', last_name: 'Okafor', country: 'NG' })
  expect(body).not.toHaveProperty('is_seeker')
  expect(mockSetState).toHaveBeenCalledWith({ profileComplete: true })
  await waitFor(() => expect(mockAuthReset).toHaveBeenCalledWith(true))
})

test('a failed save surfaces a toast and does not reset navigation', async () => {
  // Quiet the screen's expected __DEV__ console.warn for this failure path.
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockUpdateMe.mockRejectedValue(new Error('boom'))
  render(<ProfileSetupScreen />)
  fillNamesAndFinish()

  await waitFor(() => expect(mockShowToast).toHaveBeenCalled())
  expect(mockShowToast.mock.calls[0][0]).toBe('error')
  expect(mockAuthReset).not.toHaveBeenCalled()
  warnSpy.mockRestore()
})
