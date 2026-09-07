import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { colors } from '@/theme/tokens'
import { SeekerWelcomeSheet } from '../SeekerWelcomeSheet'

const mockColors = colors.dark

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: mockColors } }),
}))
jest.mock('@/components/ui', () => {
  // Jest mock factories cannot close over the module's top-level React Native import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native')
  return {
    BottomSheet: ({ visible, title, children }: {
      visible: boolean
      title: string
      children: React.ReactNode
    }) => visible ? <View><Text>{title}</Text>{children}</View> : null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable onPress={onPress}><Text>{children}</Text></Pressable>
    ),
    Spacer: () => null,
  }
})
jest.mock('lucide-react-native', () => ({ Cpu: () => null, Zap: () => null, Tag: () => null }))

const mockGetItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>
const mockSetItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetItem.mockResolvedValue(null)
  mockSetItem.mockResolvedValue(undefined)
})

it('shows once when no prior dismissal exists and persists dismissal', async () => {
  const onDismiss = jest.fn()
  render(<SeekerWelcomeSheet onDismiss={onDismiss} />)
  await screen.findByText('Welcome, Seeker!')

  fireEvent.press(screen.getByText("Let's go"))

  await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  expect(mockSetItem).toHaveBeenCalledWith('seeker_welcome_shown', '1')
  expect(screen.queryByText('Welcome, Seeker!')).toBeNull()
})

it('stays hidden after a prior dismissal', async () => {
  mockGetItem.mockResolvedValue('1')
  render(<SeekerWelcomeSheet onDismiss={jest.fn()} />)

  await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('Welcome, Seeker!')).toBeNull()
})

it('remains usable when secure storage reads and writes fail', async () => {
  const onDismiss = jest.fn()
  mockGetItem.mockRejectedValue(new Error('storage unavailable'))
  mockSetItem.mockRejectedValue(new Error('storage unavailable'))
  render(<SeekerWelcomeSheet onDismiss={onDismiss} />)
  await screen.findByText('Welcome, Seeker!')

  fireEvent.press(screen.getByText("Let's go"))

  await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('Welcome, Seeker!')).toBeNull()
})

it('deduplicates repeated dismissals while storage is pending', async () => {
  const onDismiss = jest.fn()
  let finishPersistence: (() => void) | undefined
  mockSetItem.mockReturnValue(new Promise<void>((resolve) => { finishPersistence = resolve }))
  render(<SeekerWelcomeSheet onDismiss={onDismiss} />)
  await screen.findByText('Welcome, Seeker!')

  fireEvent.press(screen.getByText("Let's go"))
  fireEvent.press(screen.getByText("Let's go"))
  expect(mockSetItem).toHaveBeenCalledTimes(1)

  finishPersistence?.()
  await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
})
