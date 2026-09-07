/**
 * ConfirmDialog, the styled confirm/cancel modal that replaces native
 * `Alert.alert`. Verifies it renders title/message/actions when visible, wires
 * the confirm/cancel callbacks, stays hidden when not visible, and supports the
 * acknowledge-only (`hideCancel`) variant.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { Modal } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { modal: '#fff' },
        utility: { scrim: 'rgba(0,0,0,0.4)' },
        border: { strong: '#ddd' },
        content: { secondary: '#555' },
      },
    },
  }),
}))

jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const baseProps = {
  title: 'Unlink wallet',
  message: 'Remove 0xAbC… from your account?',
  confirmLabel: 'Unlink',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

it('renders title, message and both actions when visible', () => {
  render(<ConfirmDialog visible {...baseProps} />)
  expect(screen.getByText('Unlink wallet')).toBeTruthy()
  expect(screen.getByText('Remove 0xAbC… from your account?')).toBeTruthy()
  expect(screen.getByText('Unlink')).toBeTruthy()
  expect(screen.getByText('Cancel')).toBeTruthy()
})

it('fires onConfirm and onCancel from the respective buttons', () => {
  render(<ConfirmDialog visible {...baseProps} />)
  fireEvent.press(screen.getByText('Unlink'))
  expect(baseProps.onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByText('Cancel'))
  expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
})

it('uses system back as cancellation', () => {
  const { UNSAFE_getByType } = render(<ConfirmDialog visible {...baseProps} />)
  UNSAFE_getByType(Modal).props.onRequestClose()

  expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
})

it('renders nothing interactive when not visible', () => {
  render(<ConfirmDialog visible={false} {...baseProps} />)
  expect(screen.queryByText('Unlink')).toBeNull()
  expect(screen.queryByText('Cancel')).toBeNull()
})

it('hideCancel drops the cancel button (acknowledge-only notice)', () => {
  render(<ConfirmDialog visible hideCancel confirmLabel="OK" title="Saved" onConfirm={jest.fn()} onCancel={jest.fn()} />)
  expect(screen.getByText('OK')).toBeTruthy()
  expect(screen.queryByText('Cancel')).toBeNull()
})

it('omits the message block when none is provided', () => {
  render(<ConfirmDialog visible title="Just a title" onConfirm={jest.fn()} onCancel={jest.fn()} />)
  expect(screen.getByText('Just a title')).toBeTruthy()
  expect(screen.getByText('Confirm')).toBeTruthy() // default confirm label
})

it('supports the destructive loading state without changing its actions', () => {
  render(<ConfirmDialog visible destructive loading {...baseProps} />)
  expect(screen.getByText('Unlink')).toBeTruthy()
  expect(screen.getByText('Cancel')).toBeTruthy()
})
