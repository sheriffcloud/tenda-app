'use client'

/**
 * Fee calculator island — mirrors mobile's escrow-guide calculator.
 *
 * The arithmetic is shared `computePlatformFeeRaw`, the SAME function the
 * server's fee path and `useEscrowFee` call, and it is BigInt floor division
 * over base units because that is what the on-chain contract does. This page
 * used to do `amount * (pct / 100)` in floating point and print it at four
 * decimal places, which is round-half-up over display units — a different rule
 * from the chain's, on the one page whose entire job is telling someone what
 * the fee will be. `parseUnits`/`formatUnits` move between the two
 * representations; nothing here multiplies or divides a float.
 *
 * The RATE is deliberately still the static `APP_INFO.fees.platformFeePct`
 * rather than live platform config: that constant is documented as static copy
 * for exactly these support surfaces, and `SUPPORT_FEE_NOTE` says the rate can
 * change. Live surfaces read the config endpoint through `useEscrowFee`. Only
 * the arithmetic was forked; the source of the rate was already right.
 *
 * Amounts are USDC because USDC is the settlement unit, and the asset is now
 * NAMED: the floor happens at the asset's precision, so a calculator that hides
 * which asset it means is hiding the thing that decides its last digit.
 */
import { useState } from 'react'
import {
  APP_INFO,
  SUPPORT_FEE_NOTE,
  USDC_DECIMALS,
  computePlatformFeeRaw,
  formatUnits,
  parseUnits,
} from '@tenda/shared'
import { InfoCard } from '@/components/public/support'

/**
 * The static percentage as the basis points the shared helper speaks.
 * `Math.round` because a percentage like 2.45 is not exactly representable and
 * `2.45 * 100` is 244.99999999999997.
 */
const FEE_BPS = Math.round(APP_INFO.fees.platformFeePct * 100)

interface Breakdown {
  fee: string
  receives: string
}

/**
 * Null when the input is not a plain amount this asset can hold.
 *
 * Grouping commas are stripped first, because the app RENDERS amounts with
 * them (`splitAssetAmount` formats en-US, so a reader copying "1,250.5" off a
 * gig card must be able to paste it here). That reading is en-US: a comma is a
 * thousands separator, never a decimal point, so "1,5" is fifteen. The same
 * assumption the display side already makes, stated rather than implied.
 */
export function feeBreakdown(input: string): Breakdown | null {
  const raw = parseUnits(input.trim().replace(/,/g, ''), USDC_DECIMALS)
  if (raw === null) return null
  const principal = BigInt(raw)
  const fee = computePlatformFeeRaw(principal, FEE_BPS)
  return {
    fee: formatUnits(fee.toString(), USDC_DECIMALS),
    receives: formatUnits((principal - fee).toString(), USDC_DECIMALS),
  }
}

export function EscrowFeeCalculator() {
  const [amount, setAmount] = useState('')
  const typed = amount.trim() !== ''
  const breakdown = typed ? feeBreakdown(amount) : null

  return (
    <InfoCard label={`Fee calculator (${APP_INFO.fees.platformFeePct}% platform fee)`}>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-content-secondary">Gig amount in USDC</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          aria-describedby={typed && breakdown === null ? 'fee-calc-error' : undefined}
          className="rounded-control border border-border-default bg-surface-background p-2.5 font-numeric text-content-primary outline-none focus:border-brand-primary"
        />
      </label>

      {/* An unparseable amount SAYS so. The float version answered zero for
          "abc" and for "-5", which reads as "no fee" rather than "not a
          number" — the worst possible answer on a page about money. */}
      {typed && breakdown === null && (
        <p id="fee-calc-error" role="alert" className="type-body-small text-feedback-danger-text">
          Enter a plain amount, up to {USDC_DECIMALS} decimal places.
        </p>
      )}

      {breakdown !== null && (
        <dl className="flex flex-col gap-1 font-numeric text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-content-secondary">Platform fee</dt>
            <dd className="text-content-primary">{breakdown.fee} USDC</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt className="text-content-secondary">Worker receives</dt>
            <dd className="text-content-primary">{breakdown.receives} USDC</dd>
          </div>
        </dl>
      )}

      <p className="text-xs text-content-tertiary">{SUPPORT_FEE_NOTE}</p>
    </InfoCard>
  )
}
