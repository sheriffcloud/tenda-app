/**
 * The card every auth step renders inside — one look for the whole flow
 * (Auth comp: the same eyebrow / headline / lede stack on signin, email,
 * verify, profile and wallet).
 *
 * `width` exists because the comp genuinely varies it and the reason is
 * legible: 420px for a single field or a list of two, 460px where six OTP
 * cells have to sit on one line, 440px where two name fields sit side by side.
 * A named size rather than a raw class so the three are a decision recorded in
 * one place instead of three magic numbers in three files.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Eyebrow } from '@/components/ui'
import { cn } from '@/lib/cn'

const WIDTHS = {
  /** One field, or a short list. */
  narrow: 'max-w-[420px]',
  /** Two fields side by side, or a details list. */
  wide: 'max-w-[440px]',
  /** Six OTP cells on one line. */
  code: 'max-w-[460px]',
} as const

export function AuthPanel({
  title,
  lede,
  eyebrow,
  back,
  width = 'narrow',
  children,
}: {
  title: string
  lede?: string
  /** The comp's mono kicker, e.g. "Last step" on the profile step. */
  eyebrow?: string
  /** Where this step came from. Every step past the chooser has one. */
  back?: { href: string; label: string }
  width?: keyof typeof WIDTHS
  children: ReactNode
}) {
  return (
    <section className={cn('w-full', WIDTHS[width])}>
      {back !== undefined && (
        <Link
          href={back.href}
          className="mb-6 inline-flex items-center gap-2 type-body-small font-semibold text-content-tertiary hover:text-content-primary"
        >
          <ArrowLeft size={16} aria-hidden />
          {back.label}
        </Link>
      )}

      {eyebrow !== undefined && (
        <Eyebrow strong as="p" className="mb-3">
          {eyebrow}
        </Eyebrow>
      )}

      {/* `break-words` on BOTH: an email address echoed back has no break
          opportunity of its own. See CLAUDE.md, "text a poster wrote" — the
          rule is about untrusted length, and a user's own address qualifies.
          The lede is where the address actually lands (the verify step's
          "Sent to …"), and without this the whole page scrolled to 595px on a
          320px screen — measured, with a 70-character address. */}
      <h1 className="break-words font-display text-[26px] font-bold leading-8 tracking-[-0.6px] text-content-primary sm:text-[30px] sm:leading-9">
        {title}
      </h1>

      {lede !== undefined && (
        <p className="mt-3 break-words type-body text-content-secondary">{lede}</p>
      )}

      <div className="mt-7">{children}</div>
    </section>
  )
}
