/**
 * DeleteDraftDialog — the off-chain draft-delete confirm. Verifies the
 * destructive copy renders when visible, wires confirm/cancel, and stays
 * hidden otherwise. (On-chain confirms are covered by tx-action/copy.test.)
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { modal: '#fff' },
      utility: { scrim: 'rgba(0,0,0,0.4)' },
      border: { strong: '#ddd' },
      content: { secondary: '#555' },
    } },
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

import { DeleteDraftDialog } from '@/components/gig/gig-action-sheets/DeleteDraftDialog'

const noop = () => {}

test('renders the delete-draft copy and both actions when visible', () => {
  render(<DeleteDraftDialog visible onCancel={noop} onConfirm={noop} />)
  expect(screen.getByText('Delete this draft?')).toBeTruthy()
  expect(screen.getByText('Delete')).toBeTruthy()
  expect(screen.getByText('Cancel')).toBeTruthy()
})

test('wires confirm and cancel', () => {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  render(<DeleteDraftDialog visible onConfirm={onConfirm} onCancel={onCancel} />)
  fireEvent.press(screen.getByText('Delete'))
  fireEvent.press(screen.getByText('Cancel'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('renders nothing interactive when hidden', () => {
  render(<DeleteDraftDialog visible={false} onCancel={noop} onConfirm={noop} />)
  expect(screen.queryByText('Delete')).toBeNull()
})
