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
  opts: { exact?: number } | { min: number; max: number },
): string | null {
  const v = value.trim()
  if (v.length === 0) return `${label} is required`
  if (!/^\d+$/.test(v)) return `${label} must contain digits only`
  if ('exact' in opts && opts.exact !== undefined) {
    return v.length === opts.exact ? null : `${label} must be ${opts.exact} digits`
  }
  if ('min' in opts) {
    return v.length >= opts.min && v.length <= opts.max
      ? null
      : `${label} must be ${opts.min}–${opts.max} digits`
  }
  return null
}

/** Value must be one of the option ids, else a message. */
export function requireOption(value: string, options: PayoutFieldOption[], label: string): string | null {
  return options.some((o) => o.value === value) ? null : `${label} is not valid`
}

/** Mask all but the last `visible` characters ('0123456789' → '•••••• 6789'). */
export function maskTail(value: string, visible = 4): string {
  const v = value.trim()
  if (v.length <= visible) return v
  return `${'•'.repeat(v.length - visible)} ${v.slice(-visible)}`
}
