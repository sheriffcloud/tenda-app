/**
 * Asset-registry display metadata — the single source for symbol/decimals
 * per asset id, mirrored into the DB `assets` table by the server seed and
 * used directly by mobile for raw-unit → display conversion. Adding a new
 * asset: extend this map, then re-seed.
 */

import { isSupportedCurrency, type SupportedCurrency } from './currencies'

export interface AssetMeta {
  symbol: string
  decimals: number
  is_stable: boolean
  /**
   * WHICH fiat currency a stable is pegged to. Required for every
   * `is_stable` asset and forbidden on every other, enforced at module load
   * by `assertStablePegs`.
   *
   * `is_stable` alone was read as "worth ~1 USD" — the dollar was never
   * written down, it was assumed by the one rule that consumes the flag
   * (`fiatRatePerUnit` divided out a hardcoded USD leg). That assumption held
   * for as long as every stable here was a dollar, and cNGN is the entry that
   * ends it: MEASURED 2026-09-06, CoinGecko prices cNGN at 0.963 NGN and USDC
   * at 1321.71 NGN, so pricing a naira stable through the dollar leg renders
   * every cNGN amount ~1,372x too high on every money surface in the app.
   *
   * DISPLAY ONLY, and an approximation by construction: it asserts the peg
   * holds, which is what a "≈ ₦5,000" line beside an amount is for. It is not
   * a quote — the P2P rate path reads the asset's real CoinGecko price
   * (`coingeckoId` below) and never assumes a peg, which is why cNGN's ~3.7%
   * discount reaches a seller's quote instead of being rounded away.
   */
  peg?: SupportedCurrency
  /** CoinGecko coin id used to price this asset in fiat (rate source). */
  coingeckoId: string
  /**
   * Human-readable currency name (e.g. 'Ether', 'Celo'). Only consumed for a
   * chain's NATIVE gas token, where the AppKit network's `nativeCurrency.name`
   * needs the long form; other assets omit it and callers fall back to `symbol`.
   */
  name?: string
  /**
   * The chain's NATIVE gas token, set only where it can be confused with an
   * ERC-20 of the same ticker. Arc is the case: its native gas token IS USDC at
   * 18 decimals while its ERC-20 USDC interface is 6, so the same dollars appear
   * twice under one symbol. A native asset is NEVER a member of USDC_ASSET_IDS
   * (the settlement unit the lifetime totals sum), whatever its ticker: summing
   * an 18-decimal amount with 6-decimal ones is wrong by 10^12.
   */
  native?: true
}

export const ASSET_META: Readonly<Record<string, AssetMeta>> = {
  SOL: { symbol: 'SOL', decimals: 9, is_stable: false, coingeckoId: 'solana', name: 'Solana' },
  SOL_DEVNET: { symbol: 'SOL', decimals: 9, is_stable: false, coingeckoId: 'solana', name: 'Solana' },
  USDC_SOL: { symbol: 'USDC', decimals: 6, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin' },
  USDC_BASE: { symbol: 'USDC', decimals: 6, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin' },
  ETH_BASE: { symbol: 'ETH', decimals: 18, is_stable: false, coingeckoId: 'ethereum', name: 'Ether' },
  cUSD: { symbol: 'cUSD', decimals: 18, is_stable: true, peg: 'USD', coingeckoId: 'celo-dollar' },
  USDC_CELO: { symbol: 'USDC', decimals: 6, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin' },
  // cNGN — the regulated Nigerian-naira stablecoin, the settlement unit that
  // lets a Nigerian seller quote and be paid in the currency they actually
  // think in. Six decimals and the peg were READ FROM THE LIVE TOKEN on Celo
  // mainnet 2026-09-06 (0xF6829D…1a4f, decimals() == 6), not taken from a
  // listing. CoinGecko's id is `compliant-naira`, NOT `cngn`.
  cNGN: { symbol: 'cNGN', decimals: 6, is_stable: true, peg: 'NGN', coingeckoId: 'compliant-naira' },
  CELO: { symbol: 'CELO', decimals: 18, is_stable: false, coingeckoId: 'celo', name: 'Celo' },
  OG: { symbol: '0G', decimals: 18, is_stable: false, coingeckoId: 'zero-gravity', name: '0G' },
  // One id, two tokens (Base pattern): Galileo runs the repo's own
  // MockUSDCPermitV2; mainnet runs USDC.e (XSwap/CCIP Bridged USDC, Circle's
  // Bridged USDC Standard — on-chain symbol "USDC.e"). Displayed as USDC on
  // purpose: the symbol also keys USDC_ASSET_IDS membership and the
  // USDC_DECIMALS guard below, and both tokens are 6-decimal dollar pegs.
  USDC_0G: { symbol: 'USDC', decimals: 6, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin' },
  // Arc (Circle's L1): USDC is BOTH the gas asset and the payment asset, and it
  // appears twice. VERIFIED ON-CHAIN 2026-10-05 against rpc.testnet.arc.io and
  // rpc.mainnet.arc.io: the ERC-20 interface at 0x3600…0000 answers decimals() 6,
  // name() and symbol() "USDC", version() "2"; native gas is 18 decimals. Two ids,
  // one symbol — and the native one is flagged so it never joins USDC_ASSET_IDS.
  USDC_ARC: { symbol: 'USDC', decimals: 6, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin' },
  USDC_ARC_NATIVE: { symbol: 'USDC', decimals: 18, is_stable: true, peg: 'USD', coingeckoId: 'usd-coin', name: 'USDC', native: true },
}

/**
 * Every stable declares its peg, and nothing else does.
 *
 * Takes the map as a parameter so the rule can be exercised with a malformed
 * one — the same shape as `assertManifestValid`, and for the same reason: a
 * guard that can only ever run over the good value is a guard nobody can show
 * works.
 *
 * BOTH directions are violations, not just the missing half:
 *   - a stable with no peg is the bug this field exists to remove. It would
 *     fall through `fiatRatePerUnit`'s stable arm to the SOL branch and answer
 *     null, so every "≈ ₦…" line beside that asset silently empties;
 *   - a peg on a NON-stable is a claim that a volatile token holds a fiat
 *     value. That one is worse than a blank, because the rule would honour it
 *     and print a firm figure for CELO or ETH derived from a peg it does not
 *     have.
 *
 * The currency is re-checked at runtime despite being a compile-time union,
 * for the reason `assertManifestValid` re-checks `status`: this module is read
 * by the landing through a Vite source alias and by the other packages through
 * the CJS dist, so a hand-edited entry carrying 'NGA' arrives at those readers
 * with no type error, indexes the rate map to `undefined`, and degrades to a
 * missing figure rather than to anything anyone would notice.
 */
export function assertStablePegs(meta: Readonly<Record<string, AssetMeta>>): void {
  for (const [id, asset] of Object.entries(meta)) {
    if (asset.is_stable && asset.peg === undefined) {
      throw new Error(`ASSET_META: stable '${id}' must declare the currency it is pegged to`)
    }
    if (!asset.is_stable && asset.peg !== undefined) {
      throw new Error(`ASSET_META: '${id}' is not a stable, so it must not declare a peg`)
    }
    if (asset.peg !== undefined && !isSupportedCurrency(asset.peg)) {
      throw new Error(`ASSET_META: '${id}' peg '${asset.peg}' is not a supported currency`)
    }
  }
}

assertStablePegs(ASSET_META)

/**
 * Display metadata for an asset id, or `null` when this build has none.
 *
 * `Object.hasOwn` rather than a bare index: a plain object inherits from
 * Object.prototype, so `ASSET_META['__proto__']` — and 'constructor', and
 * 'toString' — answer with something TRUTHY that is not an AssetMeta. A
 * `=== undefined` guard never fires, `meta.decimals` is then undefined, and
 * `10 ** undefined` is NaN: every money helper below printed the string 'NaN'
 * where an unknown asset correctly shows `UNKNOWN_AMOUNT_DISPLAY`, and the
 * prototype key itself was rendered as the ticker. MEASURED before the fix.
 *
 * The same guard `getPayoutSpec` applies to payout countries — one accessor per
 * shared vocabulary, so `?? null` and `?.` idioms downstream mean what they say
 * instead of being correct by accident.
 *
 * Not reachable from the wire today: the create validator pins `asset` to the
 * seeded `assets` table. That is a property of one caller, though, and these
 * helpers are exported and documented as answering null for what they do not
 * know.
 */
export function getAssetMeta(asset: string): AssetMeta | null {
  return Object.hasOwn(ASSET_META, asset) ? ASSET_META[asset] : null
}

/**
 * The ticker to SHOW for an asset id, or the id itself when the registry does
 * not know it — the one fallback every display surface had re-typed
 * (`getAssetMeta(a)?.symbol ?? a`, four times in shared and six in web). One
 * spelling, through the accessor, so the registry is read one way everywhere
 * and the web guard test can hold every site to it. (For the SYMBOL a bracket
 * read happened to answer the same — an inherited function has no `symbol` —
 * which is why the fallback, not the accessor, is what this helper owns; the
 * accessor is where `decimals` stops being NaN.)
 */
export function assetSymbol(asset: string): string {
  return getAssetMeta(asset)?.symbol ?? asset
}

/**
 * Every asset id that IS USDC, across chains. Derived from ASSET_META rather
 * than hardcoded, so adding `USDC_<CHAIN>` to the map above is enough.
 *
 * Exists because USDC is the settlement unit whose lifetime totals the wallet
 * screen reports, and the membership test behind that aggregate must not be a
 * hand-rolled list that drifts from the asset registry.
 *
 * ONE consumer today, established by breaking this export and reading the
 * compilers rather than by searching for the name: the server's
 * routes/v1/users/_id/transactions/summary aggregate. Neither client tests
 * membership — web reads USDC_DECIMALS for the fee calculator, mobile reads
 * neither. Said plainly because the note here used to claim the client shared
 * this test, and a rationale nobody can check is how the drift starts.
 */
export const USDC_ASSET_IDS: readonly string[] = Object.keys(ASSET_META).filter(
  (id) => ASSET_META[id].symbol === 'USDC' && ASSET_META[id].native !== true,
)

/**
 * Shared decimals for every USDC variant. Raw base units are only summable
 * ACROSS assets when the decimals match, so this throws at module load if a
 * future USDC entry disagrees rather than silently producing a wrong total.
 */
export const USDC_DECIMALS: number = (() => {
  const all = new Set(USDC_ASSET_IDS.map((id) => ASSET_META[id].decimals))
  if (all.size !== 1) {
    throw new Error(`USDC assets must share decimals; found ${[...all].join(', ')}`)
  }
  return [...all][0]
})()

/**
 * Client-side gig budget rails, in DISPLAY units — 1–50,000 for a stable,
 * 0.001–10,000 for a native token. Advisory UX rails; the program only
 * enforces > 0.
 *
 * Display units, not raw, because raw bounds are only meaningful alongside a
 * decimals count. These were `GIG_STABLE_MIN_RAW = 1_000_000` and its 6dp
 * sibling — correct for USDC and wrong for every other precision. `cUSD` is
 * already `is_stable: true` at EIGHTEEN decimals, so it would have inherited
 * a maximum of 50_000_000_000 raw = 0.00000005 cUSD, rejecting every budget
 * anyone would type. `gigAmountBounds` scales these by the asset's own
 * decimals, so a new asset is a manifest entry and nothing else.
 */
export const GIG_STABLE_MIN_DISPLAY = '1'
export const GIG_STABLE_MAX_DISPLAY = '50000'
export const GIG_NATIVE_MIN_DISPLAY = '0.001'
export const GIG_NATIVE_MAX_DISPLAY = '10000'

/**
 * Display units for a raw integer amount ('5000000', 'USDC_SOL' → 5).
 *
 * FLOAT, AND DISPLAY-ONLY. Base units are up to 78-digit strings and a double
 * carries ~15-16 significant decimal digits, so this is lossy by construction.
 * Anything that feeds a chain, or is compared against another amount, must use
 * `parseUnits`/`formatUnits` (utils/units), which are BigInt-exact.
 *
 * THE BOUND, measured rather than assumed (#50). Rounded to 4 decimal places —
 * what `splitAssetAmount` and every amount surface in the app shows — the float
 * result matches a BigInt-exact one up to 16 significant digits, and first
 * disagrees at 17: for an 18-decimal asset, 1,234,567,890,123.4567 tokens
 * renders as ...4568. That ceiling is ~1.2e12 tokens, which no asset here can
 * reach — CELO's entire supply is 1e9, and 1.2e12 cUSD would be $1.2 trillion.
 *
 * So the safe rule is about DIGITS ASKED FOR, not amount size: keep the display
 * to a few fraction digits. A caller that asks for the asset's full `decimals`
 * defeats the bound immediately — at 18 decimals the noise starts around ONE
 * token (1.234567890123456789 comes back as 1.2345678901234567). That was a
 * real defect in web's WalletBalanceGrid, fixed in #50 by routing it through
 * `splitAssetAmount` like every other surface.
 */
export function amountRawToDisplay(amount_raw: string, asset: string): number | null {
  const meta = getAssetMeta(asset)
  if (meta === null) return null
  return Number(amount_raw) / 10 ** meta.decimals
}

/**
 * What every money surface shows in place of a figure it cannot compute.
 *
 * Exported rather than written inline so the clients and the tests agree on
 * one token; it is the same em dash `MoneyText`, `ProfileStats` and
 * `FeeSummary` already use for "no value".
 */
export const UNKNOWN_AMOUNT_DISPLAY = '—'

/**
 * Text for a display amount that may not be scalable — the ONE owner of what a
 * surface shows when it cannot state a figure.
 *
 * `amount` is null when this build has no metadata for the asset (see
 * `amountRawToDisplay`), and every money surface then has the same decision to
 * make and the same answer to give. Seven of them were making it separately,
 * which is seven edits if the token or the policy ever changes, and seven
 * chances to quietly print base units instead.
 *
 * The ROUNDING stays with the caller because it genuinely differs — a card
 * shows three decimals under 1, a wallet hero always two, a tx feed four or
 * six. This owns the fallback, not the formatting.
 */
export function formatAmountOrUnknown(
  amount: number | null,
  format: (value: number) => string,
): string {
  return amount === null ? UNKNOWN_AMOUNT_DISPLAY : format(amount)
}

/** A formatted amount kept in two pieces, for callers that style them apart. */
export interface SplitAssetAmount {
  /** Display value with grouping, e.g. '1,250.5'. Never for math. */
  amount: string
  /** Ticker as shown, e.g. 'USDC'. Falls back to the asset id. */
  symbol: string
}

/**
 * The value and its ticker, separately — every surface that sets the figure
 * and the symbol at different sizes (feed card, escrow aside, dossier money
 * block) needs them apart.
 *
 * This is the PRODUCER; `formatAssetAmount` joins its output. The alternative
 * — formatting the joined string and splitting it back on a space — is what
 * the dossier did, and it makes the layout depend on a punctuation detail of
 * a function it does not own.
 *
 * DISPLAY ONLY, and float-based via `amountRawToDisplay` on purpose. Base
 * units are 78-digit strings and `Number` carries ~16 significant digits, but
 * this rounds to 4 decimal places: the first digit a double gets wrong sits
 * far below that for any amount under ~1e12 tokens. Anything that FEEDS A
 * CHAIN or is compared against another amount must use `formatUnits` /
 * `parseUnits` (utils/units), which are BigInt-exact — never this.
 */
export function splitAssetAmount(amount_raw: string, asset: string): SplitAssetAmount {
  const value = amountRawToDisplay(amount_raw, asset)
  return {
    amount: formatAmountOrUnknown(value, (v) =>
      v.toLocaleString('en-US', { maximumFractionDigits: 4 }),
    ),
    symbol: assetSymbol(asset),
  }
}

/** "5 USDC" / "0.05 SOL" — display-rounded, never for math. */
export function formatAssetAmount(amount_raw: string, asset: string): string {
  const { amount, symbol } = splitAssetAmount(amount_raw, asset)
  return `${amount} ${symbol}`
}
