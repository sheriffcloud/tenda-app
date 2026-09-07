/**
 * The centred icon / headline / body / actions screen the Auth comp uses for
 * both of its whole-page states — the error boundary (lines 638-654) and
 * offline (lines 657-676).
 *
 * One component because the two differ in exactly three things: the glyph and
 * its tone, the words, and what sits between the body and the buttons. Two
 * copies would drift the way the comps' own two blocks already have (one
 * centres its single button with `margin:auto`, the other uses a flex row).
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function StatusScreen({
  icon: Icon,
  tone,
  title,
  body,
  meta,
  children,
  actions,
}: {
  icon: LucideIcon
  tone: 'danger' | 'warning'
  title: string
  body: string
  /** The mono line under the body — a trace id, a code. Omitted when absent. */
  meta?: string
  /** Anything between the body and the actions, e.g. offline's capability list. */
  children?: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="w-full max-w-[480px] text-center">
      <Icon
        size={40}
        strokeWidth={1.75}
        aria-hidden
        className={cn(
          'mx-auto',
          tone === 'danger' ? 'text-feedback-danger-base' : 'text-feedback-warning-base',
        )}
      />
      <h1 className="mt-5 font-display text-[26px] font-bold leading-8 tracking-[-0.6px] text-content-primary sm:text-[30px] sm:leading-9">
        {title}
      </h1>
      <p className="mt-3 type-body text-content-secondary">{body}</p>
      {meta !== undefined && meta !== '' && (
        <p className="mt-4 break-words font-numeric type-body-small text-content-tertiary">
          {meta}
        </p>
      )}
      {children}
      <div className="mt-7 flex flex-wrap justify-center gap-2.5">{actions}</div>
    </div>
  )
}
