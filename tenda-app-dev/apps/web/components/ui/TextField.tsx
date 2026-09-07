import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Eyebrow } from './Eyebrow'

/**
 * Shared control skin — exported for non-input controls (select, textarea, OTP
 * field).
 *
 * `text-base` and not `text-sm`, for a reason that only shows on a phone:
 * **iOS Safari zooms the whole viewport** when a focused input is set below
 * 16px, and it does not zoom back out. On the sign-in step that is a reader
 * typing their email into a page that has just jumped. Every comp specifies
 * `font-size:16px` on its inputs; this was 14px, measured. The vertical rhythm
 * is unchanged — `py-3` with a 24px line box gives the comps' 50px control.
 */
export const controlClassName =
  // `rounded-input`: mobile Input.tsx's inset field radius (14), not the
  // 12px control radius the buttons and chips take (#59b).
  'w-full rounded-input border border-border-input bg-control-input-background px-4 py-3 text-base text-control-input-text placeholder:text-control-input-placeholder focus:border-border-input-active focus:outline-none disabled:bg-control-disabled-background disabled:text-control-disabled-text'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | null
}

/**
 * Labelled input with an inline error slot — the form control everywhere.
 *
 * The label is an `Eyebrow` — the shared label treatment (since #59c mobile's
 * mono letterforms through the generated `type-eyebrow` atom, uppercase). It
 * is also what `Eyebrow` was built for — it has carried `as`/`htmlFor` since
 * it shipped and no form had used them.
 * The one thing NOT taken from the comps is the colour: theirs
 * is `content-tertiary` (5.12:1 here), and the generated `control-input-label`
 * is 7.19:1 light and 9.80:1 dark, so the label keeps the darker token. Same
 * call as spec-correction #7 — match the comps' form, never at the cost of
 * contrast they did not measure.
 */
export function TextField({ label, error, className, ...props }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-2.5">
      <Eyebrow tone="input">{label}</Eyebrow>
      <input className={cn(controlClassName, className)} {...props} />
      {error != null && error !== '' && (
        <span className="text-sm text-feedback-danger-text">{error}</span>
      )}
    </label>
  )
}
