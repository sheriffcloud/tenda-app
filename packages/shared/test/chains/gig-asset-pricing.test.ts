import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'
import { gigAssetByChain } from '../../src/chains/manifest-queries'
import { fiatRatePerUnit } from '../../src/utils/currency-display'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../src/constants/currencies'

/**
 * The gig composer's budget field can always price the asset it is given (#81).
 *
 * WHY THIS IS A TEST AND NOT A UI STATE. `PaymentInput` opens on its FIAT tab
 * and converts through `fiatRatePerUnit`. When that answers null the field takes
 * its rates-unknown path: it declines to emit and shows "Set a budget". For an
 * asset the rule can never price, that state is PERMANENT — a tab that renders
 * as though the rates were forever loading, with nothing telling the reader the
 * difference. #76 created the possibility by correcting the rule to price only
 * what the cache can actually price (SOL by symbol, stables via the USD leg)
 * instead of pricing a unit of ETH as a unit of SOL.
 *
 * It is UNREACHABLE today, established by reading the composer rather than by
 * assuming: the asset is policy-derived, never picked. `useGigForm` takes it
 * from `gigAssetByChain`, which returns whichever asset carries the 'gig' role,
 * and every chain in the manifest gives that role to a USDC stable. The one
 * production caller of `PaymentInput` is `GigPaymentStep`, which passes that
 * value straight through (confirmed by renaming the export and reading the
 * compiler's caller list, not by searching for the asset ids).
 *
 * So the composer needs no "this asset cannot be priced" state — building one
 * would be a control for a case the producer cannot emit. What it needs is for
 * the impossibility to STAY true. Adding a chain is one manifest entry by
 * design, and that entry names its own asset roles: give the 'gig' role to a
 * native token and the dead tab appears with nothing failing anywhere. That is
 * what these two cases prevent — the first states the invariant, the second
 * proves it is a real constraint rather than a tautology.
 *
 * Web's port of the field is ASSET-units only today, so it has no FIAT tab to
 * go dead. It inherits this guard rather than needing one of its own when the
 * mode lands with the Exchange surface.
 *
 * A FILE OF ITS OWN rather than two more cases in manifest.test.ts, where the
 * other manifest-versus-another-module invariants live ('every asset id
 * resolves in ASSET_META' is the same shape). That file is already 498 lines
 * against a 300-line house limit, so adding to it would deepen a violation
 * instead of just living beside one.
 */

/**
 * A fully populated cache — every supported currency present, each on a
 * DISTINCT rate so a rule that answered the wrong currency's leg is visible
 * rather than accidentally equal. Built from the vocabulary rather than a
 * hand-listed object, so a new currency is covered the day it is added.
 *
 * The assertion is load-bearing, not decoration: `Object.fromEntries` is typed
 * `{ [k: string]: T }`, and TS does not accept an index signature where a
 * specific-key Record is wanted (TS2740, checked by removing it). An explicit
 * literal would type itself, but it would also be the hand-listed object this
 * builds from the vocabulary precisely to avoid.
 */
const RATES = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((currency, index) => [currency, 100 * (index + 1)]),
) as Record<SupportedCurrency, number>

test('every gig asset the manifest offers is priceable in every supported currency', () => {
  const gigAssets = CHAIN_MANIFEST.map((chain) => gigAssetByChain(chain.id)).filter(
    (asset): asset is string => asset !== null,
  )
  // Without this the loop below would pass having compared nothing at all — the
  // same vacuity the coverage-gate suites guard against.
  assert.ok(gigAssets.length > 0, 'no chain carries a gig asset; this check would pass vacuously')

  for (const asset of gigAssets) {
    for (const currency of SUPPORTED_CURRENCIES) {
      const rate = fiatRatePerUnit(RATES, currency, asset)
      // Asserted as exactly what the CONSUMER branches on, deliberately.
      // PaymentInput declines to emit when `rate === null || rate <= 0`, so
      // that expression is the invariant — not "the asset is a stable", which
      // would over-constrain: a SOL-denominated gig would be perfectly
      // priceable and would fail a stable-shaped assertion. The exact
      // per-asset arithmetic is currency-display.test.ts's job.
      assert.ok(
        rate !== null && rate > 0 && Number.isFinite(rate),
        `${asset} cannot be priced in ${currency} (got ${String(rate)}) — the composer's FIAT tab would be permanently dead for a gig on this chain`,
      )
    }
  }
})

test('the manifest carries assets this rule CANNOT price, so the invariant has teeth', () => {
  // If `fiatRatePerUnit` priced everything the manifest names, the case above
  // would hold no matter which role any asset carried, and would go on passing
  // through exactly the change it exists to catch. The native gas tokens are
  // what make it discriminating: ETH and CELO have no leg in a SOL-denominated
  // cache, which is precisely why they must never carry the 'gig' role.
  //
  // Asserted over the whole manifest rather than by naming ETH_BASE and CELO,
  // so this keeps meaning something on a chain set that has not been added yet.
  //
  // USD is the currency to ask in, not an arbitrary pick: it is the leg every
  // stable divides by, so it is the one this rule can most easily answer. An
  // asset it cannot price in USD cannot be priced in anything.
  const unpriceable = CHAIN_MANIFEST.flatMap((chain) => chain.assets.map((asset) => asset.id)).filter(
    (id) => fiatRatePerUnit(RATES, 'USD', id) === null,
  )
  assert.ok(
    unpriceable.length > 0,
    'every manifest asset is priceable, so the gig-asset check above can no longer fail',
  )
})
