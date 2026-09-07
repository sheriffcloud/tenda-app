'use client'

/**
 * Budget input for the composer's payment step — web port of mobile's
 * PaymentInput, ASSET-units mode only.
 *
 * DIVERGENCE from mobile, deliberate and temporary: mobile offers a FIAT
 * entry mode converted through the exchange-rate + settings stores, neither
 * of which exists on web yet (they land with the Exchange surface, S6.4).
 *
 * The money math is NOT this component's — it is `@tenda/shared`'s
 * gig-budget helpers, which both clients now share. This file used to do
 * `Math.round(parseFloat(text) * 10 ** decimals)`, float math that cannot
 * represent an 18-decimal budget. What is left here is the field: text in,
 * base-unit string out.
 */
import { useState } from 'react'
import {
  ASSET_META,
  gigBudgetRangeLabel,
  gigBudgetToRaw,
  gigBudgetToText,
  sanitizeGigBudgetText,
} from '@tenda/shared'

export function PaymentInput({
  asset,
  value,
  onChange,
}: {
  /** Asset registry id (CO5), drives decimals, symbol and budget rails. */
  asset: string
  /** Budget in raw units of `asset`; '' when it has not been set. */
  value: string
  onChange: (raw: string) => void
}) {
  const symbol = ASSET_META[asset]?.symbol ?? asset

  // Seeded once from the incoming raw (a resumed draft) and owned by the
  // field thereafter — the text is what the reader typed, and re-deriving it
  // from `value` on every render would rewrite it mid-entry.
  const [text, setText] = useState(() => gigBudgetToText(value, asset))

  function handleChange(typed: string) {
    // Sanitize BEFORE it reaches state, so the field cannot hold a number the
    // asset cannot represent — see sanitizeGigBudgetText for why refusing the
    // digit beats rounding it.
    const next = sanitizeGigBudgetText(typed, asset)
    setText(next)
    onChange(gigBudgetToRaw(next, asset))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 rounded-card bg-surface-inset px-4 py-3">
        <span className="type-caption font-semibold uppercase text-content-tertiary">
          Budget
        </span>
        <input
          inputMode="decimal"
          value={text}
          placeholder="0.00"
          aria-label={`Budget in ${symbol}`}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full bg-transparent font-mono text-xl font-bold text-content-primary outline-none placeholder:text-content-tertiary"
        />
        <span className="font-mono text-sm text-content-tertiary">{symbol}</span>
      </div>
      <p className="text-xs text-content-tertiary">Budget {gigBudgetRangeLabel(asset)}</p>
    </div>
  )
}
