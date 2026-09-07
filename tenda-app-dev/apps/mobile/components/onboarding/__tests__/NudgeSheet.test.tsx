import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { NudgeSheet } from '../NudgeSheet'

const mockDismissNudge = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({ dismissNudge: mockDismissNudge }),
}))
jest.mock('@/components/ui', () => {
  // Jest mock factories cannot close over the module's top-level React Native import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native')
  return {
    BottomSheet: ({ visible, title, children, onClose }: {
      visible: boolean
      title: string
      children: React.ReactNode
      onClose: () => void
    }) => visible ? <View><Text>{title}</Text>{children}<Pressable accessibilityLabel="Close" onPress={onClose} /></View> : null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable onPress={onPress}><Text>{children}</Text></Pressable>
    ),
    Spacer: () => null,
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockDismissNudge.mockResolvedValue(undefined)
})

it('persists dismissal before closing from the secondary action', async () => {
  const onClose = jest.fn()
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByText('Got it'))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(mockDismissNudge).toHaveBeenCalledWith('post')
  expect(mockPush).not.toHaveBeenCalled()
})

it('persists dismissal, closes, and then opens the guide', async () => {
  const onClose = jest.fn()
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByText('Show me how'))

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(support)/posting'))
  expect(mockDismissNudge).toHaveBeenCalledWith('post')
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('uses the same persistent dismissal path for the sheet close control', async () => {
  const onClose = jest.fn()
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByLabelText('Close'))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(mockDismissNudge).toHaveBeenCalledWith('post')
})

it('still closes and navigates when dismissal persistence fails', async () => {
  const onClose = jest.fn()
  mockDismissNudge.mockRejectedValue(new Error('storage unavailable'))
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByText('Show me how'))

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(support)/posting'))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('deduplicates repeated actions while dismissal persistence is pending', async () => {
  const onClose = jest.fn()
  let finishPersistence: (() => void) | undefined
  mockDismissNudge.mockReturnValue(new Promise<void>((resolve) => { finishPersistence = resolve }))
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByText('Show me how'))
  fireEvent.press(screen.getByText('Show me how'))
  expect(mockDismissNudge).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()

  finishPersistence?.()
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('deduplicates repeated dismissals while persistence is pending', async () => {
  const onClose = jest.fn()
  let finishPersistence: (() => void) | undefined
  mockDismissNudge.mockReturnValue(new Promise<void>((resolve) => { finishPersistence = resolve }))
  render(<NudgeSheet visible nudgeKey="post" title="Before you create" body="Guide" guideRoute="/(support)/posting" onClose={onClose} />)

  fireEvent.press(screen.getByText('Got it'))
  fireEvent.press(screen.getByLabelText('Close'))
  expect(mockDismissNudge).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()

  finishPersistence?.()
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('accepts a new dismissal after the sheet closes and reopens', async () => {
  const onClose = jest.fn()
  const props = {
    nudgeKey: 'post' as const,
    title: 'Before you create',
    body: 'Guide',
    guideRoute: '/(support)/posting' as const,
    onClose,
  }
  const { rerender } = render(<NudgeSheet visible {...props} />)

  fireEvent.press(screen.getByText('Got it'))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

  rerender(<NudgeSheet visible={false} {...props} />)
  rerender(<NudgeSheet visible {...props} />)
  fireEvent.press(screen.getByText('Got it'))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  expect(mockDismissNudge).toHaveBeenCalledTimes(2)
})
