/**
 * The wallet's "≈ ₦…" line: priced through the shared rule (a stable divides
 * out its own peg's leg), withheld whenever the figure cannot be honest.
 */
import { walletFiatLine } from '../wallet-fiat'

const RATES = { USD: 1, NGN: 1500, KES: 130 }

test('USDC is priced through the USD leg: 100 USDC at 1500 NGN per dollar is ₦150,000', () => {
  expect(walletFiatLine(100, RATES, 'NGN', 'USDC_SOL')).toBe('≈ ₦150,000')
})

test('it divides the peg out — the leg is read from the cache, not assumed to be 1', () => {
  // SOL priced at 150 USD and 225,000 NGN: one dollar is 1,500 naira.
  expect(walletFiatLine(2, { USD: 150, NGN: 225_000 }, 'NGN', 'USDC_BASE')).toBe('≈ ₦3,000')
})

test('every USDC id prices the same (they share the USD peg)', () => {
  const a = walletFiatLine(10, RATES, 'KES', 'USDC_SOL')
  expect(a).not.toBeNull()
  expect(walletFiatLine(10, RATES, 'KES', 'USDC_CELO')).toBe(a)
  expect(walletFiatLine(10, RATES, 'KES', 'USDC_0G')).toBe(a)
})

test('feed down with nothing cached → no line', () => {
  expect(walletFiatLine(100, null, 'NGN', 'USDC_SOL')).toBeNull()
})

test('a missing leg → no line: no USD leg, or no leg for the target currency', () => {
  expect(walletFiatLine(100, { NGN: 1500 }, 'NGN', 'USDC_SOL')).toBeNull()
  expect(walletFiatLine(100, { USD: 1 }, 'NGN', 'USDC_SOL')).toBeNull()
  expect(walletFiatLine(100, { USD: 0, NGN: 1500 }, 'NGN', 'USDC_SOL')).toBeNull()
})

test('a total the build could not scale → no line', () => {
  expect(walletFiatLine(null, RATES, 'NGN', 'USDC_SOL')).toBeNull()
})

test('an asset with no metadata is not priced', () => {
  expect(walletFiatLine(100, RATES, 'NGN', 'NOT_AN_ASSET')).toBeNull()
})
