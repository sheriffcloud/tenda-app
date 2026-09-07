/**
 * The FIAT side of the budget field: what a fiat number means in base units,
 * what a budget looks like written in a currency, and when the field has to be
 * rewritten because one of those changed underneath it.
 *
 * Split out of PaymentInput.tsx when #66 took that file past the 300-line
 * limit, and worth its own module regardless: the component is a text field
 * with two tabs, while this is the money. Everything here is about the
 * denomination — none of it applies in ASSET mode, where the field IS the
 * amount.
 */
import { useEffect, useRef } from 'react'
import {
  gigBudgetFromUnits,
  gigBudgetToText,
  formatUnits,
  parseUnits,
  FIAT_ENTRY_DECIMALS,
  type SupportedCurrency,
} from '@tenda/shared'

/**
 * The asset→fiat rule moved to @tenda/shared in #76 and is re-exported here so
 * this module stays the one import for the field's money. It left because the
 * feed's gig cards need the same rule — they render the "≈ ₦…" line off
 * `toAssetPaymentDisplay`, which could not price a stable and so showed nothing
 * beside a USDC gig while this field showed a naira figure for the same money.
 */
export { fiatRatePerUnit } from '@tenda/shared'

type Mode = 'FIAT' | 'ASSET'

/**
 * A fiat amount as base units of `asset`.
 *
 * No local finite/zero check: `gigBudgetFromUnits` answers '' for anything
 * non-finite or <= 0, and that is where the rule belongs. A duplicate here read
 * as load-bearing while being unreachable — `sanitizeDecimalText` has already
 * stripped everything that could parse to NaN (measured: 'abc', 'Infinity',
 * '1e5' and '-5' all sanitize to a finite-parsing string).
 *
 * Nor is a trailing point stripped first, which this used to do: `Number` reads
 * '1500.' as 1500 already. Checked across every shape the sanitizer can emit
 * ('.', '0.', '.5', '1.', '1500.0', …, 20 in all) — the strip changed no answer,
 * and its mutant survived, which is how it was found.
 */
export function fiatTextToRaw(fiatText: string, fiatPerUnit: number, asset: string): string {
  return gigBudgetFromUnits(Number(fiatText) / fiatPerUnit, asset)
}

/**
 * The inverse: base units written as a fiat amount for the field.
 *
 * Trimmed by round-tripping through the shared unit helpers rather than a local
 * regex — `toFixed` pads ('15000.00'), the asset side already trims through
 * exactly this path, and one rule beats two that can disagree about '0.10'.
 *
 * `parseUnits` answering null is the same end `gigBudgetFromUnits` refuses
 * explicitly: above 1e21 `toFixed` returns exponential notation, which is not a
 * decimal string. Nothing near it is a real budget — the rails top out at
 * 50,000 units — but a silent '' beats a field showing '1.5e+21'.
 */
export function rawToFiatText(raw: string, fiatPerUnit: number, asset: string): string {
  // No `hasGigBudget` check of its own, for the reason its counterpart states.
  // An unset raw formats to '' and `Number('')` is 0, so it fails the positive
  // test below anyway — as does anything else `gigBudgetToText` cannot read,
  // which it also answers '' for (measured: '', '0' and 'abc' all reach 0).
  // A guard that cannot be broken cannot be proved either: that one was written
  // first, survived its mutant, and was deleted.
  const fiat = Number(gigBudgetToText(raw, asset)) * fiatPerUnit
  if (!Number.isFinite(fiat) || fiat <= 0) return ''
  const base = parseUnits(fiat.toFixed(FIAT_ENTRY_DECIMALS), FIAT_ENTRY_DECIMALS)
  return base === null ? '' : formatUnits(base, FIAT_ENTRY_DECIMALS)
}

interface DenominationSync {
  asset: string
  /** Budget in raw base units; '' when unset. */
  value: string
  mode: Mode
  currency: SupportedCurrency
  rate: number | null
  /** Read, not watched — see the effect's dependency note. */
  text: string
  setText: (next: string) => void
  onChange: (raw: string) => void
}

/**
 * Keep the field honest across the two edges that move underneath it.
 *
 * RATE ARRIVES for a budget typed while it was unknown (#49). The early return
 * in handleChangeText is correct — converting a fiat number as if it were asset
 * units would misprice by ~1500x — but on its own it only declined to emit.
 * Nothing re-ran once the rate landed, so a budget typed during the rates
 * request stayed on screen with "Set a budget" underneath it: a number shown
 * and not counted, the same dishonesty #32 removed for a trailing point.
 *
 * DENOMINATION CHANGES (#66). Keying only on the rate conflated these two. A
 * currency switch used to be handled one of two ways depending on cache state:
 * to an UNCACHED currency the rate passed through null, the transition fired,
 * and the typed number was re-read as the new currency; to a CACHED one nothing
 * re-ran at all, so the emitted raw stayed the OLD currency's valuation under a
 * suffix already reading the new one (NGN->KES both cached: 150000 on screen, a
 * budget of 100 USDC rather than 1000). Same gesture, two budgets, decided by
 * what happened to be in the cache.
 *
 * OPTION (b), chosen by the product owner over re-pricing (a) and clearing (c):
 * the budget is PRESERVED and the field is RESTATED. A currency change says how
 * the money is written down, not how much it is — so the RAW becomes the source
 * of truth and `onChange` is never called. (a) would move what the gig is worth
 * by the rate ratio while the reader watched; (c) would throw away a budget they
 * had already set.
 *
 * WHICH SIDE IS AUTHORITATIVE therefore depends on which edge fired:
 *   denomination changed -> the RAW is the truth, restate the text;
 *   rate merely arrived  -> the TEXT is the truth, convert it and emit.
 *
 * The restatement can outlive its render: a switch to a currency with no cached
 * rate cannot honestly show a number, so the field blanks and `awaiting` carries
 * the intent to the render where the rate lands. The budget survives that gap
 * untouched, so the step stays satisfied throughout — and the reader may type
 * into the blank while they wait, in which case their number wins and the
 * restatement is abandoned.
 */
export function useDenominationSync({
  asset,
  value,
  mode,
  currency,
  rate,
  text,
  setText,
  onChange,
}: DenominationSync): void {
  const lastRateRef = useRef(rate)
  const lastCurrencyRef = useRef(currency)
  const awaitingRestateRef = useRef(false)

  useEffect(() => {
    const previous = lastRateRef.current
    const denominationChanged = currency !== lastCurrencyRef.current
    lastRateRef.current = rate
    lastCurrencyRef.current = currency
    // ASSET mode's number is not denominated in fiat, so neither edge applies
    // to it. The rate and currency refs are updated ABOVE this return, so a
    // toggle back cannot read a change that happened while the tab was hidden
    // as if it had just happened. A pending restatement deliberately survives
    // the toggle rather than being cleared here: `toggleMode` empties both the
    // field and the budget, so whichever branch it later lands in agrees —
    // checked, and a reset would be a guard no mutation could kill.
    if (mode !== 'FIAT') return

    if (denominationChanged) {
      // No rate for the new currency yet: show nothing rather than a number
      // still denominated in the currency the reader just left, and carry the
      // restatement to the render where the rate lands.
      if (rate === null || rate <= 0) {
        awaitingRestateRef.current = true
        setText('')
        return
      }
      // Cleared, so a second switch cannot leave a stale restatement pending.
      awaitingRestateRef.current = false
      setText(rawToFiatText(value, rate, asset))
      return
    }

    if (awaitingRestateRef.current) {
      if (rate === null || rate <= 0) return
      awaitingRestateRef.current = false
      // The blank field was not inert: the reader could type into it while the
      // rate was out, and anything there now is theirs — we emptied it. That
      // number is already denominated in the NEW currency and is the newer
      // intent, so it wins, and restating the old budget over it would erase
      // what they just entered. This inference only holds HERE: on the cached
      // path nothing was blanked, so text there is the old currency's number.
      if (text !== '') {
        // Emitted unconditionally, exactly as handleChangeText does for a
        // keystroke with the rate already known: if what they typed converts to
        // no budget ('0', '.'), that IS the answer and the old budget must go.
        // Declining to emit here would leave '0' on screen with the previous
        // currency's budget still counted — the gap this task is about.
        onChange(fiatTextToRaw(text, rate, asset))
        return
      }
      setText(rawToFiatText(value, rate, asset))
      return
    }

    const ratesJustArrived = (previous === null || previous <= 0) && rate !== null && rate > 0
    if (!ratesJustArrived) return
    // An empty field needs no guard of its own: `gigBudgetFromUnits` answers ''
    // for anything <= 0, so there is nothing to emit and nothing to clear.
    const raw = fiatTextToRaw(text, rate, asset)
    if (raw !== '') onChange(raw)
    // `text`, `mode`, `value` and `asset` are read, not watched: an edit
    // re-enters handleChangeText, which converts directly. This effect exists
    // for the two edges above alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, currency])
}
