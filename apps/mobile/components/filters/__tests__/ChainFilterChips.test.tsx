/**
 * ChainFilterChips — options come from the live chain registry, never a
 * hardcoded list, and the control hides itself when there is nothing to
 * choose between.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ScrollView, StyleSheet } from 'react-native'
import type { ChainRegistryEntry } from '@tenda/shared'

const mockChains = jest.fn()
jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (selector: (s: { chains: ChainRegistryEntry[] | null }) => unknown) =>
    selector({ chains: mockChains() }),
}))
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Chip: ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{`${label}${selected ? ' *' : ''}`}</Text>
      </Pressable>
    ),
  }
})

import { ChainFilterChips } from '../ChainFilterChips'

const chain = (id: string, display_name: string): ChainRegistryEntry => ({
  id,
  namespace: id.startsWith('solana') ? 'solana' : 'eip155',
  display_name,
  escrow_address: '0xdead',
  assets: [],
})

const TWO_CHAINS = [chain('solana:devnet', 'Solana Devnet'), chain('eip155:84532', 'Base Sepolia')]

beforeEach(() => mockChains.mockReset())

test('renders one chip per registered chain plus "All chains"', () => {
  mockChains.mockReturnValue(TWO_CHAINS)
  render(<ChainFilterChips value={null} onChange={jest.fn()} />)
  expect(screen.getByText('All chains *')).toBeTruthy()
  expect(screen.getByText('Solana Devnet')).toBeTruthy()
  expect(screen.getByText('Base Sepolia')).toBeTruthy()
})

test('emits the CAIP-2 id the server filter expects', () => {
  mockChains.mockReturnValue(TWO_CHAINS)
  const onChange = jest.fn()
  render(<ChainFilterChips value={null} onChange={onChange} />)
  fireEvent.press(screen.getByText('Base Sepolia'))
  expect(onChange).toHaveBeenCalledWith('eip155:84532')
})

test('re-tapping the active chain does NOT clear the filter', () => {
  // The row is single-select with an explicit "All chains" option, so a second
  // tap must be a no-op. Toggling to null here meant a user who tapped again
  // (thinking the first tap hadn't registered) landed silently on all chains.
  mockChains.mockReturnValue(TWO_CHAINS)
  const onChange = jest.fn()
  render(<ChainFilterChips value="eip155:84532" onChange={onChange} />)
  fireEvent.press(screen.getByText('Base Sepolia *'))
  expect(onChange).not.toHaveBeenCalledWith(null)
  expect(onChange).toHaveBeenCalledWith('eip155:84532')
})

test('"All chains" clears the filter', () => {
  mockChains.mockReturnValue(TWO_CHAINS)
  const onChange = jest.fn()
  render(<ChainFilterChips value="solana:devnet" onChange={onChange} />)
  fireEvent.press(screen.getByText('All chains'))
  expect(onChange).toHaveBeenCalledWith(null)
})

test('renders nothing before the registry has loaded', () => {
  mockChains.mockReturnValue(null)
  const { toJSON } = render(<ChainFilterChips value={null} onChange={jest.fn()} />)
  expect(toJSON()).toBeNull()
})

test('renders nothing on a single-chain deployment — a one-option filter is noise', () => {
  mockChains.mockReturnValue([chain('solana:devnet', 'Solana Devnet')])
  const { toJSON } = render(<ChainFilterChips value={null} onChange={jest.fn()} />)
  expect(toJSON()).toBeNull()
})

test('stays visible when the options collapse to one but a filter is ACTIVE', () => {
  // A chain disabled server-side while the user has it selected must not hide
  // the only control that can clear the filter.
  mockChains.mockReturnValue([chain('solana:devnet', 'Solana Devnet')])
  const onChange = jest.fn()
  render(<ChainFilterChips value="eip155:84532" onChange={onChange} />)
  fireEvent.press(screen.getByText('All chains'))
  expect(onChange).toHaveBeenCalledWith(null)
})

describe('sizing (it renders as screen furniture, not just as list content)', () => {
  test('cancels ScrollView\'s own flex so it cannot grow into the list below', () => {
    // RN ScrollView's `baseHorizontal` is { flexGrow: 1, flexShrink: 1 }. Inert
    // inside a FlatList header (auto-height content container), but as a direct
    // child of a screen's flex column it made this one-line row split the
    // leftover height with the list — the list started at half-page. Layout is
    // not simulated in tests, so the style itself is what gets pinned.
    mockChains.mockReturnValue(TWO_CHAINS)
    const { UNSAFE_root } = render(<ChainFilterChips value={null} onChange={jest.fn()} />)
    const scroll = UNSAFE_root.findByType(ScrollView)
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({
      flexGrow: 0,
      flexShrink: 0,
    })
  })

  test('applies gutterX INSIDE the scroll content, so chips still scroll edge to edge', () => {
    mockChains.mockReturnValue(TWO_CHAINS)
    const { UNSAFE_root } = render(
      <ChainFilterChips value={null} onChange={jest.fn()} gutterX={16} />,
    )
    const scroll = UNSAFE_root.findByType(ScrollView)
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      paddingHorizontal: 16,
      // Standalone vertical rhythm: a gap above (nothing else separates it from
      // the tab bar) and none below — the list underneath owns its top padding,
      // and must, since this row renders null on a single-chain deployment.
      paddingTop: 12,
      paddingBottom: 0,
    })
    // Never as a wrapper padding — that would clip the row's scrollable width.
    expect(StyleSheet.flatten(scroll.props.style)).not.toMatchObject({ paddingHorizontal: 16 })
  })

  test('as list content it takes no gutter and keeps its bottom gap', () => {
    // In a header the list's content container supplies the horizontal gutter,
    // and the row's own bottom padding is the gap to the first card.
    mockChains.mockReturnValue(TWO_CHAINS)
    const { UNSAFE_root } = render(<ChainFilterChips value={null} onChange={jest.fn()} />)
    const flat = StyleSheet.flatten(UNSAFE_root.findByType(ScrollView).props.contentContainerStyle)
    expect(flat.paddingHorizontal).toBeUndefined()
    expect(flat.paddingTop).toBeUndefined()
    expect(flat.paddingBottom).toBe(16)
  })
})
