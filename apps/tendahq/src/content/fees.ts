/**
 * Fee facts — DERIVED from the shared platform-config defaults, the same
 * constants the `platform_config` columns default to and the server falls
 * back to when the row is unseeded. (The review WINDOW used to be derived
 * here too; it is a contract value that differs per network, so since #148
 * the landing phrases it and never counts it.)
 *
 * WHY THIS FILE EXISTS. "2.5%" was written out as a literal in six places
 * across the landing — the fee FAQ twice, the minimum-amount answer, §04's
 * worked example, the Seeker proof point and the hero's loading state — while
 * the hero ALSO rendered the live figure from `/v1/platform/config`. Every one
 * of those numbers is admin-editable at runtime, so the page could show a live
 * 2% in the hero and a hardcoded 2.5% in the FAQ on the same screen.
 *
 * Two rules follow from that:
 *
 *   1. Nothing on the landing types a fee figure. It comes from here, or —
 *      where the surface can run a hook — live from the platform config via
 *      `<FeePct />`.
 *   2. These values are the DEFAULTS, not the truth. The live config wins
 *      wherever it can be read; this is what to print while it loads, and the
 *      floor under any copy that cannot run a hook (a plain string in a data
 *      table). They can never drift from the server, because they are the
 *      server's own constants.
 */

import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared/constants/platform'
import { ESCROW_LIMITS } from '@tenda/shared/constants/escrow'
import { GIG_ASSET_IDS } from './chains'
import { registryAsset } from './registry-asset'

/** bps → a display percentage: 250 → '2.5', 100 → '1'. */
function pct(bps: number): string {
  return String(bps / 100)
}

/** Standard platform-fee rate as a display percentage ('2.5'). */
export const FEE_PCT = pct(PLATFORM_CONFIG_DEFAULTS.fee_bps)

/** Reduced Solana Mobile (Seeker) rate as a display percentage ('1'). */
export const SEEKER_FEE_PCT = pct(PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps)

/**
 * The CEILING the escrow contract enforces on the platform fee, as a display
 * percentage ('10').
 *
 * A different fact from the two rates above, and the FAQ's trust answer leans
 * on it: the fee is read at settlement rather than frozen at post time, so the
 * only thing bounding what a live escrow can be charged is this cap. That
 * answer typed "10%" by hand — the one fee figure on the landing still written
 * out, in the section a sceptical reader checks first, and a claim about the
 * CONTRACT rather than about a tunable.
 *
 * Derived from `ESCROW_LIMITS.maxPlatformFeeBps`, which is the same 1000 bps
 * TendaEscrow declares as `MAX_PLATFORM_FEE_BPS` and validates every
 * `setFeeBps` against — so the sentence cannot outlive the bound it describes.
 */
export const MAX_FEE_PCT = pct(ESCROW_LIMITS.maxPlatformFeeBps)

/**
 * §04's worked example, computed rather than typed.
 *
 * The principal is the one editorial choice — a round, small, believable gig
 * budget. Everything after it is the contract's own arithmetic: floor division
 * to the asset's base units, then `amount − fee` to the counterparty, exactly
 * as `_settleToCounterparty` and `computePlatformFeeRaw` do it. Typing "0.30"
 * and "11.70" by hand is what let the page show a fee split that no longer
 * matched the configured rate.
 */
const EXAMPLE_PRINCIPAL_USDC = 12
/**
 * The registry entry for the asset gigs are actually escrowed in.
 *
 * Read through `registryAsset` (`getAssetMeta`, Object.hasOwn), never by bracket —
 * the accessor the rest of the monorepo was swept onto after #116, because a
 * plain bracket read answers a prototype key ('toString', 'constructor') with a
 * truthy inherited FUNCTION whose `.decimals` is undefined. `10 ** undefined`
 * is NaN, and the whole worked example below would render as NaN with nothing
 * throwing. The key here comes from the manifest so it cannot be one of those
 * today; the accessor is what keeps that a property of the ACCESS rather than
 * of the current caller.
 *
 * Throwing is the right answer to a miss: this runs at module load, so a gig
 * asset the registry does not carry fails the landing's build rather than
 * shipping a fee example computed from nothing.
 */
const GIG_ASSET = registryAsset(GIG_ASSET_IDS[0], 'fees')

/**
 * Base units per whole token, from the DECIMALS of the asset gigs are actually
 * escrowed in — not a typed-out 1_000_000. The number is only 1e6 because USDC
 * is a 6-decimal token, which is a fact about the asset registry rather than
 * about this file, and reading it from there is what stops the worked example
 * being wrong by a factor of ten if the gig asset ever changes.
 */
const USDC_BASE_UNITS = 10 ** GIG_ASSET.decimals

/**
 * The symbol gigs are escrowed in ('USDC'), from the same asset whose decimals
 * scale the worked example above.
 *
 * Lives here rather than beside each surface that prints it: two surfaces now
 * show a figure and its unit together — the hero's escrow panel and the hire
 * loop's custody scene — and a symbol typed next to a derived number is one
 * edit away from labelling it wrongly.
 */
export const GIG_ASSET_SYMBOL: string = GIG_ASSET.symbol

function usdc(baseUnits: number): string {
  const whole = baseUnits / USDC_BASE_UNITS
  // Trailing zeros matter in a money column: 11.7 must read as 11.70.
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(2)
}

const principalRaw = EXAMPLE_PRINCIPAL_USDC * USDC_BASE_UNITS
const feeRaw = Math.floor((principalRaw * PLATFORM_CONFIG_DEFAULTS.fee_bps) / 10_000)

/**
 * The example in BASE UNITS, exposed alongside the display strings.
 *
 * Tests must assert on these, not on the formatted strings: the display
 * formatter rounds to 2dp, so `Number('0.30') * 1e6` erases any error smaller
 * than a cent. A mutation that changed the contract's floor division to
 * `ceil(...) + 1` — a wrong fee by one base unit — passed every assertion that
 * went through the string. Raw values are what make the arithmetic checkable.
 */
export const FEE_EXAMPLE_RAW = {
  principal: principalRaw,
  fee: feeRaw,
  payout: principalRaw - feeRaw,
  baseUnitsPerToken: USDC_BASE_UNITS,
  feeBps: PLATFORM_CONFIG_DEFAULTS.fee_bps,
} as const

export const FEE_EXAMPLE = {
  /** '12 USDC' — what the poster locks. */
  locked: `${usdc(principalRaw)} USDC`,
  /** '11.70 USDC' — what the worker is credited. */
  payout: `${usdc(principalRaw - feeRaw)} USDC`,
  /** Bare numbers for prose that has to say them in a sentence. */
  lockedAmount: usdc(principalRaw),
  feeAmount: usdc(feeRaw),
  payoutAmount: usdc(principalRaw - feeRaw),
} as const
