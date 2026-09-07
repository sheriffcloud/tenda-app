/**
 * The per-(wallet, chain) rows under the USDC hero, and the one distinction
 * they exist to keep: a balance of nothing versus no reading at all (#64).
 *
 * The rows used to print '0 USDC' whenever `usdc` was absent, which is what a
 * chain the reader failed on looks like. Web's grid has shown a dash for this
 * since it was written, and its own header explains why — "you have nothing
 * here" and "we could not read this" are different facts.
 */
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
