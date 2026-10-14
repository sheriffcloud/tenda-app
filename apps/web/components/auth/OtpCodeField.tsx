'use client'

/**
 * Web analogue of mobile's OtpCodeField: ONE input (autofill/one-time-code
 * friendly, one focus target for screen readers) styled as spaced digits.
 * Filters to digits, clamps to `length`, and swallows a keystroke that does
 * not change the digits — typing a letter into a full field must not re-fire
 * the caller's auto-submit.
 */
import type { Ref } from 'react'
import { controlClassName } from '@/components/ui'
import { AUTH_COPY } from './copy'
import { cn } from '@/lib/cn'

interface OtpCodeFieldProps {
  value: string
  onChange: (digits: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  /**
   * So a caller can put the cursor back. A rejected code DISABLES this input
   * while the request is in flight, and a browser blurs a disabled element —
   * which drops focus to <body> exactly when the reader needs to retype.
   */
  ref?: Ref<HTMLInputElement>
  'aria-label'?: string
}

export function OtpCodeField({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  ref,
  'aria-label': ariaLabel = AUTH_COPY.verify.codeLabel,
}: OtpCodeFieldProps) {
  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, length)
    // Against the CONTROLLED value, never a ref of what was last reported:
    // the caller CLEARS this field when the server rejects a code, and a ref
    // would still hold those six digits — so re-pasting the same code (the
    // obvious move after a network failure) matched, returned early, and left
    // an input that visibly did nothing. Compared with `value` the same
    // keystroke-level dedupe holds and the cleared field accepts the retry.
    if (digits === value) return
    onChange(digits)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={length}
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={'•'.repeat(length)}
      className={cn(controlClassName, 'font-numeric text-center text-2xl tracking-[0.6em]')}
    />
  )
}
