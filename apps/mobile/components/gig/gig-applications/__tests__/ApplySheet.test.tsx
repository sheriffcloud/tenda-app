/**
 * The apply sheet.
 *
 * The obligation notice is the reason this component is tested rather than
 * eyeballed: D2 makes an applicant accountable for a gig they are assigned to,
 * so if that notice ever stops rendering, people take on a strike-eligible
 * commitment without being told. Everything else here is about not losing what
 * they typed.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { APPLICATION_MESSAGE_MAX_LENGTH } from '@tenda/shared'
import { ApplySheet } from '../ApplySheet'
import { APPLY_OBLIGATION, APPLY_SUBMIT_LABEL } from '../copy'

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
  const { Text, TextInput, View } = require('react-native')
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
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Text onPress={onPress}>{children}</Text>
    ),
  }
})

function setup(submitResult = true) {
  const onSubmit = jest.fn().mockResolvedValue(submitResult)
  const onClose = jest.fn()
  render(<ApplySheet visible busy={false} onClose={onClose} onSubmit={onSubmit} />)
  return { onSubmit, onClose }
}

test('the obligation is stated before the applicant commits, not after', () => {
  setup()
  expect(screen.getByText(APPLY_OBLIGATION)).toBeTruthy()
})

test('a pitch is sent as typed', async () => {
  const { onSubmit, onClose } = setup()

  fireEvent.changeText(screen.getByTestId('pitch'), 'I can start on Monday')
  await act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })

  expect(onSubmit).toHaveBeenCalledWith('I can start on Monday')
  expect(onClose).toHaveBeenCalled()
})

test('an all-whitespace pitch is null, the same as none at all', async () => {
  // The server trims to null too; the two sides must agree, or "  " would be
  // stored as a pitch on one and absent on the other.
  const { onSubmit } = setup()

  fireEvent.changeText(screen.getByTestId('pitch'), '   \n  ')
  await act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })

  expect(onSubmit).toHaveBeenCalledWith(null)
})

test('applying with no pitch at all is allowed — the message is optional', async () => {
  const { onSubmit, onClose } = setup()

  await act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })

  expect(onSubmit).toHaveBeenCalledWith(null)
  expect(onClose).toHaveBeenCalled()
})

test('a failed submit keeps the sheet open AND keeps what they wrote', async () => {
  // Closing on failure would throw away the pitch and leave the applicant
  // believing they had applied.
  const { onClose } = setup(false)

  fireEvent.changeText(screen.getByTestId('pitch'), 'worth keeping')
  await act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByTestId('pitch').props.value).toBe('worth keeping')
})

test('the input is capped at the length the server enforces', () => {
  // A 422 after typing 900 characters is a worse way to learn the limit.
  setup()
  expect(screen.getByText(new RegExp(`max=${APPLICATION_MESSAGE_MAX_LENGTH}`))).toBeTruthy()
})

test('a hidden sheet renders nothing at all', () => {
  render(<ApplySheet visible={false} busy={false} onClose={() => {}} onSubmit={jest.fn()} />)
  expect(screen.queryByText(APPLY_OBLIGATION)).toBeNull()
})
