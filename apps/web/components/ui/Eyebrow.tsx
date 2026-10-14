/**
 * The section label. It appears above nearly every block in all six comps —
 * a rail heading, a card's "LOCKED IN ESCROW", a dossier's "AMOUNT", the
 * feed's market line — always with the same letterforms and always
 * subordinate to what it labels.
 *
 * The letterforms are MOBILE's `Eyebrow.tsx` and tendahq's `.eyebrow`, through
 * the generated `type-eyebrow` atom: mono, 9.5/12, 600, +0.95px, uppercase
 * (#59c, 2026-09-02). Spec-correction #44 had moved this to the body face at
 * 0.08em; the port takes the phone's letterforms back so the three apps
 * label things the same way, and the atom carries size, line box, weight and
 * tracking together, so none of them can drift here.
 *
 * `strong` was the comps' bolder 11px variant for a label carrying a count.
 * Mobile has no such eyebrow; it has `label` (body face, 12/16, 600, +0.24),
 * which is what a counted label is on the phone, so `strong` maps to the
 * `type-label` atom — sentence case, not uppercase.
 *
 * A primitive rather than a repeated class string because the tracking is
 * the part that drifts: it was already written seventeen ways across this
 * app, and a label set at 0.1em beside one set at 0.08em reads as a mistake
 * without anyone being able to say which one is wrong.
 *
 * `as` exists because the same visual is sometimes a heading in the document
 * outline (a section's title) and sometimes just a label (a figure's caption).
 * Picking the tag by how it LOOKS is how screen-reader outlines fill up with
 * headings nobody meant to publish.
 */
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type EyebrowTone = 'tertiary' | 'secondary' | 'warning' | 'brand' | 'input'

const TONE_CLASSES: Record<EyebrowTone, string> = {
  tertiary: 'text-content-tertiary',
  secondary: 'text-content-secondary',
  warning: 'text-feedback-warning-text',
  brand: 'text-brand-primary',
  /**
   * Form-field labels. The comps set these in `content-tertiary` like every
   * other eyebrow; the generated `control-input-label` is the same hue two
   * steps darker (7.19:1 against the page, against tertiary's 5.12:1), and a
   * label you are about to type under is worth the darker one.
   */
  input: 'text-control-input-label',
}

/** The two letterform sets, both generated atoms — see the header. */
export const EYEBROW_ATOM = 'type-eyebrow uppercase'
export const EYEBROW_STRONG_ATOM = 'type-label'

export function Eyebrow({
  as: Tag = 'p',
  tone = 'tertiary',
  strong = false,
  htmlFor,
  id,
  className,
  children,
}: {
  as?: ElementType
  tone?: EyebrowTone
  /** A label that carries a count: mobile's `label` style instead of the eyebrow. */
  strong?: boolean
  /** Only meaningful with `as="label"`; declared so it need not be spread in. */
  htmlFor?: string
  /** Target for an `aria-labelledby` when this eyebrow names a group. */
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Tag
      htmlFor={htmlFor}
      id={id}
      className={cn(strong ? EYEBROW_STRONG_ATOM : EYEBROW_ATOM, TONE_CLASSES[tone], className)}
    >
      {children}
    </Tag>
  )
}
