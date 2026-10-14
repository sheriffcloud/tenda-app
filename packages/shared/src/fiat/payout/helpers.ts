import type { PayoutFieldOption } from './types'

/**
 * Reusable payout-field validators + masking, composed by each country spec's
 * `validate`/`maskAccountNumber` so the per-country files stay declarative and
 * free of duplicated parsing logic.
 */

/** Non-empty (after trim), else a "<label> is required" message. */
export function requireNonEmpty(value: string, label: string): string | null {
  return value.trim().length > 0 ? null : `${label} is required`
}

/**
 * All-digits with an exact length or an inclusive [min,max] range, else a
 * message naming the expectation. Empty input reports "required" first.
 */
export function requireDigits(
  value: string,
  label: string,
  // `exact` is REQUIRED in its arm, not optional. Optional made `{}` a legal
  // argument, and `{}` matched neither arm and fell through to `return null` —
  // a rail whose length rule was left half-written would have accepted any
  // digit string of any length, silently and with nothing to compile against.
  // Requiring it makes that call a type error and the fall-through unwritable.
  opts: { exact: number } | { min: number; max: number },
): string | null {
  const v = value.trim()
  if (v.length === 0) return `${label} is required`
  if (!/^\d+$/.test(v)) return `${label} must contain digits only`
  if ('exact' in opts) {
    return v.length === opts.exact ? null : `${label} must be ${opts.exact} digits`
  }
  return v.length >= opts.min && v.length <= opts.max
    ? null
    : `${label} must be ${opts.min}–${opts.max} digits`
}

/** Value must be one of the option ids, else a message. */
export function requireOption(value: string, options: PayoutFieldOption[], label: string): string | null {
  return options.some((o) => o.value === value) ? null : `${label} is not valid`
}

/**
 * Mask all but the last `visible` characters ('0123456789' → '•••••• 6789').
 *
 * `visible` is deliberately NOT defaulted. How much of an account may be shown
 * is the rail's decision — GH and PH e-wallets reveal three, every bank rail
 * reveals four — and a default would answer that question for a rail whose
 * author had not thought about it, silently and in the direction of showing
 * more. All eight call sites state their own tail.
 */
export function maskTail(value: string, visible: number): string {
  const v = value.trim()
  if (v.length <= visible) return v
  return `${'•'.repeat(v.length - visible)} ${v.slice(-visible)}`
}

/**
 * The canonical form of an IBAN: no whitespace, upper case.
 *
 * `requireIban` normalises internally so a pasted grouped IBAN validates, which
 * means the value the user typed and the value that identifies the account are
 * not the same string. Anything that STORES or COMPARES one must use this.
 */
export function canonicalIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * IBAN, checked properly: country prefix, exact length, and the ISO 13616
 * mod-97 checksum.
 *
 * The checksum is the point. A length check alone accepts a transposed pair of
 * digits, and an IBAN is the ONE field where a typo does not bounce — it either
 * fails at the bank days later or, with the wrong check digits, reaches a
 * different account. Mod-97 catches every single-digit error and every
 * transposition, which is what it was designed for.
 *
 * Spaces and case are normalised because people paste IBANs in the grouped
 * form their bank prints them in ("AE07 0331 2345 6789 0123 456").
 */
export function requireIban(
  value: string,
  label: string,
  opts: { country: string; length: number },
): string | null {
  const iban = canonicalIban(value)
  if (iban.length === 0) return `${label} is required`
  if (!iban.startsWith(opts.country)) return `${label} must start with ${opts.country}`
  if (iban.length !== opts.length) return `${label} must be ${opts.length} characters`
  if (!/^[A-Z0-9]+$/.test(iban)) return `${label} must contain letters and digits only`
  // "is not valid", not "is not a valid IBAN": the label IS "IBAN" at the only
  // call site, so the two collided into "IBAN is not a valid IBAN" — which is
  // what it actually printed. Phrasing the failure without repeating the noun
  // keeps it readable whatever a future rail calls its field.
  return mod97(iban) === 1 ? null : `${label} is not valid — check for a typo`
}

/**
 * ISO 13616 check: move the first four characters to the end, map letters to
 * two-digit numbers (A=10 … Z=35), and take the whole thing mod 97.
 *
 * Reduced digit-by-digit rather than via BigInt because an IBAN is up to 34
 * characters, so the expanded numeric string exceeds Number.MAX_SAFE_INTEGER
 * and a single `%` on a parsed number would silently lose precision.
 *
 * PRECONDITION: `iban` is already canonical — upper case, [A-Z0-9] only. The
 * caller guards that one line above; the `code >= 65` test below reads a
 * lower-case letter as a much larger number and would answer confidently and
 * wrongly, so this stays private.
 */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const code = char.charCodeAt(0)
    // 'A'..'Z' → 10..35, '0'..'9' → 0..9
    const chunk = code >= 65 ? String(code - 55) : char
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return remainder
}
