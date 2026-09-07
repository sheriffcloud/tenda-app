/**
 * NetworkPicker — the chain chips on the payment step.
 *
 * Written for #58: this component was the surface the defect was SEEN on and
 * it had no test at all (0% coverage), so nothing on mobile held either the
 * collapse rule or the press guard. Web's twin is covered by pickers.test.tsx;
 * the label copy itself is proved once, in shared.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { GigChainOption } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { tertiary: '#777' } } } }),
}))
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: string }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Chip', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Chip: ({ label, selected, disabled, onPress }: {
      label: string; selected?: boolean; disabled?: boolean; onPress?: () => void
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === true, disabled: disabled === true }}
        onPress={onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
  }
})

import { NetworkPicker } from '../NetworkPicker'

function option(id: string, label: string, state: GigChainOption['state']): GigChainOption {
  return { id, label, state, enabled: state === 'ready' }
}

const SOL = option('solana:devnet', 'Solana', 'ready')
const EVM = option('eip155:84532', 'Base Sepolia', 'needs_wallet')

function setup(options: GigChainOption[], selected = 'solana:devnet') {
  const onSelect = jest.fn()
  render(<NetworkPicker options={options} selected={selected} onSelect={onSelect} assetSymbol="USDC" />)
  return onSelect
}

test('collapses entirely when there is no choice to make', () => {
  setup([SOL])
  expect(screen.queryByText('Network')).toBeNull()
})

test('names the payout asset so the network is not read as a currency choice', () => {
  setup([SOL, EVM])
  expect(screen.getByText(/paid in USDC on this network/)).toBeTruthy()
})

test('a chain the account cannot sign on is disabled and SAYS why', () => {
  setup([SOL, EVM])
  expect(screen.getByText('Base Sepolia (link a wallet)')).toBeTruthy()
  // The ready one carries no parenthetical at all — the note is the exception.
  expect(screen.getByText('Solana')).toBeTruthy()
  // Asserted on the CHIP, not only through the press guard: a chip that looks
  // pressable and silently does nothing is the worse of the two failures.
  const [solana, base] = screen.getAllByRole('button')
  expect(solana.props.accessibilityState.disabled).toBe(false)
  expect(base.props.accessibilityState.disabled).toBe(true)
})

test('pressing an offerable chain reports its id', () => {
  const onSelect = setup([SOL, EVM])
  fireEvent.press(screen.getByText('Solana'))
  expect(onSelect).toHaveBeenCalledWith('solana:devnet')
})

test('pressing a DISABLED chain reports nothing — the escrow cannot land there', () => {
  const onSelect = setup([SOL, EVM])
  fireEvent.press(screen.getByText('Base Sepolia (link a wallet)'))
  expect(onSelect).not.toHaveBeenCalled()
})

test('marks the current chain as the selected one', () => {
  setup([SOL, EVM], 'eip155:84532')
  const [solana, base] = screen.getAllByRole('button')
  expect(solana.props.accessibilityState.selected).toBe(false)
  expect(base.props.accessibilityState.selected).toBe(true)
})

test('every wallets-load state that disables a chip still renders it, each with its own reason', () => {
  // Three causes disable a chip and they must not read alike: only a real
  // absence may say "link a wallet".
  for (const [state, note] of [
    ['wallets_loading', '(checking wallets)'],
    ['wallets_unavailable', '(wallets unavailable)'],
  ] as const) {
    const onSelect = setup([SOL, option('eip155:84532', 'Base Sepolia', state)])
    fireEvent.press(screen.getByText(`Base Sepolia ${note}`))
    expect(onSelect).not.toHaveBeenCalled()
    screen.unmount()
  }
})
