import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmountOrUnknown, UNKNOWN_AMOUNT_DISPLAY,
  ASSET_META,
  getAssetMeta,
  GIG_NATIVE_MAX_DISPLAY,
  GIG_NATIVE_MIN_DISPLAY,
  GIG_STABLE_MAX_DISPLAY,
  GIG_STABLE_MIN_DISPLAY,
  amountRawToDisplay,
  formatAssetAmount,
  splitAssetAmount,
} from '../../src/constants/assets'
import { INHERITED_OBJECT_KEYS } from '../helpers/inherited-keys'
import { parseUnits, formatUnits } from '../../src/utils/units'

test('ASSET_META: every entry has a symbol, non-negative decimals, boolean is_stable, coingeckoId', () => {
  for (const [id, meta] of Object.entries(ASSET_META)) {
    assert.ok(meta.symbol.length > 0, `${id} symbol`)
    assert.ok(Number.isInteger(meta.decimals) && meta.decimals >= 0, `${id} decimals`)
    assert.equal(typeof meta.is_stable, 'boolean', `${id} is_stable`)
    assert.ok(meta.coingeckoId.length > 0, `${id} coingeckoId`)
  }
})

test('ASSET_META: stablecoins are flagged, native coins are not', () => {
  assert.equal(ASSET_META.USDC_SOL.is_stable, true)
  assert.equal(ASSET_META.USDC_BASE.is_stable, true)
  assert.equal(ASSET_META.cUSD.is_stable, true)
  assert.equal(ASSET_META.SOL.is_stable, false)
  assert.equal(ASSET_META.ETH_BASE.is_stable, false)
})

test('ASSET_META: native gas tokens carry a long-form name for AppKit nativeCurrency', () => {
  assert.equal(ASSET_META.ETH_BASE.name, 'Ether')
  assert.equal(ASSET_META.CELO.name, 'Celo')
  assert.equal(ASSET_META.SOL.name, 'Solana')
})

test('the gig rails are ordered, positive, and PARSEABLE as display amounts', () => {
  // They are display strings now, and gigAmountBounds runs them through
  // parseUnits — which answers null for anything malformed and would silently
  // turn a typo here into a bound of '0'. So the parse is what is asserted,
  // not just the ordering.
  for (const [min, max] of [
    [GIG_STABLE_MIN_DISPLAY, GIG_STABLE_MAX_DISPLAY],
    [GIG_NATIVE_MIN_DISPLAY, GIG_NATIVE_MAX_DISPLAY],
  ]) {
    for (const value of [min, max]) {
      const raw = parseUnits(value, 18)
      assert.notEqual(raw, null, value)
      assert.ok(BigInt(raw as string) > 0n, value)
    }
    assert.ok(BigInt(parseUnits(max, 18) as string) > BigInt(parseUnits(min, 18) as string))
  }
})

test('amountRawToDisplay: divides by 10**decimals per asset', () => {
  assert.equal(amountRawToDisplay('5000000', 'USDC_SOL'), 5) // 6dp
  assert.equal(amountRawToDisplay('50000000', 'SOL'), 0.05) // 9dp
  assert.equal(amountRawToDisplay('0', 'USDC_SOL'), 0)
})

test('amountRawToDisplay: an unknown asset answers null, never base units', () => {
  // Base units are not an approximation of the amount — they are wrong by
  // 10^decimals. This used to return 1234 for what a 6-dp token would show as
  // 0.001234, i.e. a number a million times too large on a money surface. The
  // reachable path is an installed client older than the server's asset seed
  // (ASSET_META is the source the seed is built FROM).
  assert.equal(amountRawToDisplay('1234', 'MYSTERY'), null)
})

test('amountRawToDisplay: a known asset is unaffected by that guard', () => {
  // The control. A null for everything would also satisfy the test above.
  assert.equal(amountRawToDisplay('1234000', 'USDC_SOL'), 1.234)
})

test('formatAssetAmount: renders value + symbol, rounding display to 4 dp', () => {
  assert.equal(formatAssetAmount('5000000', 'USDC_SOL'), '5 USDC')
  assert.equal(formatAssetAmount('50000000', 'SOL'), '0.05 SOL')
})

test('formatAssetAmount: unknown asset keeps the id as the symbol and shows NO figure', () => {
  // The symbol still names what it is; the value does not pretend to be known.
  assert.equal(formatAssetAmount('1000', 'MYSTERY'), `${UNKNOWN_AMOUNT_DISPLAY} MYSTERY`)
})


test('splitAssetAmount: returns the value and the ticker apart', () => {
  assert.deepEqual(splitAssetAmount('5000000', 'USDC_SOL'), { amount: '5', symbol: 'USDC' })
  assert.deepEqual(splitAssetAmount('50000000', 'SOL'), { amount: '0.05', symbol: 'SOL' })
})

test('splitAssetAmount: unknown asset keeps the id as the symbol, withholds the value', () => {
  assert.deepEqual(splitAssetAmount('1000', 'MYSTERY'), {
    amount: UNKNOWN_AMOUNT_DISPLAY,
    symbol: 'MYSTERY',
  })
})

test('splitAssetAmount: keeps grouping separators inside the VALUE half', () => {
  // The reason this function exists: splitting the joined string on a space
  // is fine, but splitting on the FIRST space is not, and neither survives a
  // future locale that groups with one. The halves are never re-parsed here.
  const { amount, symbol } = splitAssetAmount('1250500000', 'USDC_SOL')
  assert.equal(amount, '1,250.5')
  assert.equal(symbol, 'USDC')
})

test('splitAssetAmount: joined by a single space IS formatAssetAmount', () => {
  // Pins the delegation. If the two ever diverge, a card would show a
  // different figure from the detail page it opens.
  for (const [raw, asset] of [
    ['5000000', 'USDC_SOL'],
    ['1250500000', 'USDC_SOL'],
    ['50000000', 'SOL'],
    ['0', 'USDC_BASE'],
    ['1000', 'MYSTERY'],
    ['1000000000000000000', 'ETH_BASE'],
  ] as const) {
    const { amount, symbol } = splitAssetAmount(raw, asset)
    assert.equal(`${amount} ${symbol}`, formatAssetAmount(raw, asset), `${raw} ${asset}`)
  }
})

test('splitAssetAmount: zero is a value, never an empty half', () => {
  assert.deepEqual(splitAssetAmount('0', 'USDC_BASE'), { amount: '0', symbol: 'USDC' })
})

test('amountRawToDisplay: exact at 4dp across the realistic range, for an 18-decimal asset', () => {
  // Pins the bound the docstring states (#50), so an "optimisation" that
  // widened the loss would be caught. Compared against formatUnits, which is
  // BigInt-exact, at the 4 decimal places the app actually renders.
  const at4 = (raw: string) => (amountRawToDisplay(raw, 'cUSD') ?? 0).toFixed(4)
  const exactAt4 = (raw: string) => {
    const [whole, frac = ''] = formatUnits(raw, 18).split('.')
    return Number(`${whole}.${(frac + '00000').slice(0, 5)}`).toFixed(4)
  }
  const raw = (tokens: string) => {
    const [whole, frac = ''] = tokens.split('.')
    return (BigInt(whole) * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18))).toString()
  }
  for (const tokens of ['1250.7531', '12345.6789', '1234567.8912', '123456789.1234', '123456789012.3456']) {
    assert.equal(at4(raw(tokens)), exactAt4(raw(tokens)), `diverged at ${tokens} tokens`)
  }
})

test('amountRawToDisplay: asking for the asset FULL decimals is what breaks it', () => {
  // The measured sharp edge, kept visible so nobody reintroduces it: at 18
  // decimals a double cannot carry the fraction, and the loss starts around
  // one token — nowhere near the ~1.2e12 ceiling the 4dp reading enjoys.
  const raw = '1234567890123456789' // 1.234567890123456789 cUSD
  assert.equal(formatUnits(raw, 18), '1.234567890123456789')
  assert.notEqual(
    (amountRawToDisplay(raw, 'cUSD') ?? 0).toLocaleString('en-US', { maximumFractionDigits: 18 }),
    '1.234567890123456789',
  )
  // ...while the 4dp reading every surface uses stays honest.
  assert.equal(splitAssetAmount(raw, 'cUSD').amount, '1.2346')
})

test('formatAmountOrUnknown: a known amount goes to the caller\'s formatter', () => {
  assert.equal(formatAmountOrUnknown(1462.5, (v) => v.toFixed(2)), '1462.50')
  assert.equal(formatAmountOrUnknown(0, (v) => v.toFixed(2)), '0.00')
})

test('formatAmountOrUnknown: zero is a real amount, not a missing one', () => {
  // The guard is `=== null`, deliberately: `0` and `NaN`-free falsiness would
  // both be swallowed by a truthiness check, and a zero balance is a fact.
  assert.notEqual(formatAmountOrUnknown(0, (v) => v.toFixed(2)), UNKNOWN_AMOUNT_DISPLAY)
})

test('formatAmountOrUnknown: null never reaches the formatter', () => {
  // Not just "returns the token" — the formatter must not run at all, or a
  // caller doing `v.toFixed()` would throw before the fallback could answer.
  let ran = false
  const out = formatAmountOrUnknown(null, (v) => {
    ran = true
    return v.toFixed(2)
  })

  assert.equal(out, UNKNOWN_AMOUNT_DISPLAY)
  assert.equal(ran, false)
})

/**
 * A plain object inherits from Object.prototype, so a bare `ASSET_META[asset]`
 * answers with something TRUTHY — a FUNCTION — for '__proto__', 'constructor',
 * 'toString' and friends. `meta === undefined` never fires, `meta.decimals` is
 * undefined, and `10 ** undefined` is NaN: MEASURED, every money helper printed
 * the string 'NaN' where an unknown asset correctly shows an em dash, and the
 * prototype key itself was rendered as the ticker.
 *
 * The same defect `getPayoutSpec` fixed for payout countries, one vocabulary
 * over. Not reachable from the wire today — the create validator pins `asset`
 * to the seeded `assets` table — but these helpers are exported, documented as
 * answering null for anything they do not know, and consumed by both clients
 * from server-supplied ids.
 */
test('getAssetMeta: resolves a real asset and refuses everything else', () => {
  assert.deepEqual(getAssetMeta('USDC_SOL'), ASSET_META.USDC_SOL)
  assert.equal(getAssetMeta('MYSTERY'), null)
  assert.equal(getAssetMeta(''), null)
})

test('getAssetMeta: an inherited Object key is not an asset', () => {
  for (const key of INHERITED_OBJECT_KEYS) {
    assert.equal(getAssetMeta(key), null, `${key} resolved to asset metadata`)
  }
})

test('amountRawToDisplay: an inherited Object key answers null, never NaN', () => {
  for (const key of INHERITED_OBJECT_KEYS) {
    assert.equal(amountRawToDisplay('1234', key), null, `${key} produced a figure`)
  }
})

test('splitAssetAmount / formatAssetAmount: an inherited Object key shows no figure', () => {
  for (const key of INHERITED_OBJECT_KEYS) {
    assert.deepEqual(
      splitAssetAmount('1000', key),
      { amount: UNKNOWN_AMOUNT_DISPLAY, symbol: key },
      `${key} rendered a value`,
    )
    assert.equal(formatAssetAmount('1000', key), `${UNKNOWN_AMOUNT_DISPLAY} ${key}`)
  }
})
