/**
 * The per-(wallet, chain) rows under the USDC hero, and the one distinction
 * they exist to keep: a balance of nothing versus no reading at all (#64).
 *
 * The rows used to print '0 USDC' whenever `usdc` was absent, which is what a
 * chain the reader failed on looks like. Web's grid has shown a dash for this
 * since it was written, and its own header explains why — "you have nothing
 * here" and "we could not read this" are different facts.
 */
import { StyleSheet, Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import type { WalletChainBalance } from '@tenda/shared'
import { WalletBalanceRows } from '../WalletBalanceRows'

// `StyleSheet` as well as `useUnistyles`: the component reaches Text through
// the `@/components/ui` barrel, which also pulls Header, and Header builds its
// styles with unistyles' StyleSheet at module load.
jest.mock('react-native-unistyles', () => ({
  StyleSheet: { create: (sheet: unknown) => sheet },
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { default: '#ccc' },
        content: { primary: '#000', tertiary: '#666' },
      },
    },
  }),
}))

/**
 * REAL asset ids from ASSET_META, not invented ones: `formatAssetAmount` scales
 * by the metadata's decimals and falls back to raw base units plus the id when
 * it finds none — so a made-up id renders "45,000,000 USDC_MADE_UP" and the
 * case passes or fails for the wrong reason.
 */
function chain(overrides: Partial<WalletChainBalance> = {}): WalletChainBalance {
  return {
    chainId: 'eip155:84532',
    namespace: 'eip155',
    displayName: 'Base Sepolia',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    usdc: { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '45000000', decimals: 6, isStable: true },
    native: { assetId: 'ETH_BASE', symbol: 'ETH', amountRaw: '10000000000000000', decimals: 18, isStable: false },
    others: [],
    ...overrides,
  }
}

test('a real reading shows the figure, and the native token beside it', () => {
  render(<WalletBalanceRows balances={[chain()]} />)
  expect(screen.getByText('Base Sepolia')).toBeTruthy()
  expect(screen.getByText('45 USDC')).toBeTruthy()
  expect(screen.getByText('0.01 ETH')).toBeTruthy()
})

test('a genuinely empty wallet still shows a zero — that is a reading', () => {
  // The half that keeps the fix honest: dropping every falsy figure would hide
  // empty wallets, which is a different lie from the one being fixed.
  render(<WalletBalanceRows balances={[chain({ usdc: { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '0', decimals: 6, isStable: true } })]} />)
  expect(screen.getByText('0 USDC')).toBeTruthy()
})

test('a chain with NO usdc reading shows a dash, never a zero', () => {
  render(<WalletBalanceRows balances={[chain({ usdc: null })]} />)
  expect(screen.getByText('—')).toBeTruthy()
  expect(screen.queryByText('0 USDC')).toBeNull()
})

test('a missing native reading is withheld rather than invented', () => {
  render(<WalletBalanceRows balances={[chain({ native: null })]} />)
  expect(screen.getByText('45 USDC')).toBeTruthy()
  expect(screen.queryByText(/ETH/)).toBeNull()
})

test('no chains at all renders nothing — not an empty padded wrapper', () => {
  // `toJSON()`, not a queryByText: with the early return deleted the component
  // still maps over an empty list and emits its <View>, so a "no text found"
  // assertion passes either way. Measured — that mutant survived until this
  // asserted on the tree itself.
  expect(render(<WalletBalanceRows balances={[]} />).toJSON()).toBeNull()
})

/**
 * The per-chain action slot (#100).
 *
 * Generic on purpose — the rows must not know that a gas claim is what fills
 * it. These two cases pin the contract the gas-claim chip relies on: the slot
 * receives THIS row's chain id, and a null answer leaves the row exactly as it
 * was. Without the second one, a feature that returns null for most chains
 * could still be quietly adding an empty view to every row.
 */
test('renderChainAction is called with each row’s own chain id, and its node is rendered', () => {
  const seen: string[] = []
  render(
    <WalletBalanceRows
      balances={[chain(), chain({ chainId: 'solana:devnet', address: 'So1111' })]}
      renderChainAction={(id) => {
        seen.push(id)
        return id === 'solana:devnet' ? <Text>GET GAS</Text> : null
      }}
    />,
  )
  expect(seen).toEqual(['eip155:84532', 'solana:devnet'])
  // Only the chain whose renderer returned a node shows one.
  expect(screen.getAllByText('GET GAS')).toHaveLength(1)
})

test('a row with no action renders exactly what it did before the slot existed', () => {
  const withSlot = render(
    <WalletBalanceRows balances={[chain()]} renderChainAction={() => null} />,
  ).toJSON()
  const without = render(<WalletBalanceRows balances={[chain()]} />).toJSON()
  // Structural equality, not a snapshot file: the claim is that an empty slot
  // is invisible, and a snapshot would happily record it becoming visible.
  expect(withSlot).toStrictEqual(without)
})

/**
 * REGRESSION (#100 audit, C1). The action slot must not make rows taller.
 *
 * The first cut gave the native line `minHeight: 20` so a row with a chip and a
 * row without would match. They did — at 20pt each, when the native text's own
 * line box is 16 (lineHeight 15 + marginTop 1). Every row on the screen grew by
 * 4pt to spare the rare row that gains a chip from changing height, which is
 * the opposite of the trade #100 exists to make: the offer is supposed to cost
 * nothing to the user who is not being offered anything.
 *
 * Asserted on the style rather than a measured layout because RTL does not lay
 * out: a `minHeight` on this container is precisely the mistake, so its absence
 * is the thing worth pinning.
 */
test('the action slot imposes no minimum height — a row without an offer is unchanged', () => {
  render(<WalletBalanceRows balances={[chain()]} renderChainAction={() => null} />)
  const line = screen.getByTestId('native-line')
  const flat = StyleSheet.flatten(line.props.style) as { minHeight?: number }
  expect(flat.minHeight).toBeUndefined()
})

test('a held cNGN or cUSD balance is shown beneath the native figure', () => {
  render(
    <WalletBalanceRows
      balances={[chain({
        others: [
          { assetId: 'cNGN', symbol: 'cNGN', amountRaw: '1500000000', decimals: 6, isStable: true },
          { assetId: 'cUSD', symbol: 'cUSD', amountRaw: '2500000000000000000', decimals: 18, isStable: true },
        ],
      })]}
    />,
  )
  expect(screen.getByTestId('other-asset-cNGN')).toBeTruthy()
  expect(screen.getByText('1,500 cNGN')).toBeTruthy()
  expect(screen.getByText('2.5 cUSD')).toBeTruthy()
})

test('an asset the wallet holds NONE of is not listed — a row per empty asset would bury the figure', () => {
  render(
    <WalletBalanceRows
      balances={[chain({ others: [{ assetId: 'cNGN', symbol: 'cNGN', amountRaw: '0', decimals: 6, isStable: true }] })]}
    />,
  )
  expect(screen.queryByTestId('other-asset-cNGN')).toBeNull()
  expect(screen.queryByText(/cNGN/)).toBeNull()
})
