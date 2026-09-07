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

// The signer row has its own suite and pulls the wallet adapter stack in;
// here it is a marker, so what is asserted is that the dialog MOUNTS it (and
// with which binding), not how it renders.
jest.mock('@/components/wallet/SigningWalletRow', () => {
  const { Text } = require('react-native')
  return {
    SigningWalletRow: ({ chainId, bound }: { chainId: string; bound?: string | null }) => (
      <Text>{`signer:${chainId}:${String(bound)}`}</Text>
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

test('with a chain, the dialog says WHICH wallet is about to open', () => {
  // "Your wallet will open next" is not much use to a reader holding two.
  render(
    <TxConfirmDialog
      action="approve"
      ctx={GIG}
      chainId="eip155:84532"
      boundSigner="0xBound"
      onConfirm={noop}
      onCancel={noop}
    />,
  )
  expect(screen.getByText('signer:eip155:84532:0xBound')).toBeTruthy()
})

test('an escrow with no recorded binding still previews the free signer', () => {
  render(
    <TxConfirmDialog
      action="approve"
      ctx={GIG}
      chainId="eip155:84532"
      boundSigner={null}
      onConfirm={noop}
      onCancel={noop}
    />,
  )
  expect(screen.getByText('signer:eip155:84532:null')).toBeTruthy()
})

test('without a chain there is no signer row at all — nothing to name', () => {
  // The gate is also used before an escrow exists on a chain the caller has
  // not settled; inventing a wallet there would be a guess on screen.
  render(<TxConfirmDialog action="approve" ctx={GIG} onConfirm={noop} onCancel={noop} />)
  expect(screen.queryByText(/^signer:/)).toBeNull()
})
