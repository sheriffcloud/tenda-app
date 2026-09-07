/**
 * TxConfirmDialog — the pre-sign gate wrapper. Verifies it renders the derived
 * kind-aware copy for a gated action, wires confirm/cancel, and renders nothing
 * for a null or ungated action (those flow through their own input sheets).
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

import { TxConfirmDialog } from '@/components/escrow/tx-action/TxConfirmDialog'

const GIG = { amount: '50 USDC', kind: 'gig' as const }
const noop = () => {}

test('renders the gated action copy + wallet note and wires confirm/cancel', () => {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  render(<TxConfirmDialog action="approve" ctx={GIG} onConfirm={onConfirm} onCancel={onCancel} />)

  expect(screen.getByText('Release payment?')).toBeTruthy()
  expect(screen.getByText(/Your wallet will open next/i)).toBeTruthy()

  fireEvent.press(screen.getByText('Approve & Pay'))
  fireEvent.press(screen.getByText('Cancel'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('renders nothing for a null action', () => {
  render(<TxConfirmDialog action={null} ctx={GIG} onConfirm={noop} onCancel={noop} />)
  expect(screen.queryByText('Approve & Pay')).toBeNull()
})

test('renders nothing for an ungated action (dispute has its own sheet)', () => {
  render(<TxConfirmDialog action="dispute" ctx={GIG} onConfirm={noop} onCancel={noop} />)
  expect(screen.queryByText('Cancel')).toBeNull()
})
