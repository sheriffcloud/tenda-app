import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_INFO } from '@tenda/shared'
import { BrandTile } from '@/components/public/BrandMark'
import { TermsNotice } from '@/components/auth/TermsNotice'
import { WELCOME_COPY } from '@/components/onboarding/copy'
import { buttonVariants } from '@/components/ui'
import { GuestOnlyGate } from '@/components/app/GuestOnlyGate'

export const metadata: Metadata = {
  title: WELCOME_COPY.title,
  description: WELCOME_COPY.lede,
  alternates: { canonical: '/welcome' },
}

/**
 * The brand hero (Auth comp, lines 439-452) — the front door for someone who
 * arrived without an account.
 *
 * Server-rendered and indexable: it is the one authed-adjacent screen with
 * nothing private on it, and it is where the focused shell's wordmark now
 * points. Every other `(focused)` route is `noindex` because a sign-in step is
 * not a landing page.
 *
 * The comp's browse line is a plain sentence; here the middle of it is a LINK.
 * The sentence's whole job is to say an account is optional, and a claim you
 * cannot act on from the screen making it sends the reader back to the header
 * to look for the way through.
 */
export default function WelcomePage() {
  return (
    <GuestOnlyGate><div className="w-full max-w-[520px] text-center">
      <BrandTile size={56} />

      <h1 className="mt-7 text-balance font-display text-[34px] font-bold leading-10 tracking-[-1.2px] text-content-primary sm:text-[44px] sm:leading-[50px]">
        {WELCOME_COPY.title}
      </h1>
      <p className="mx-auto mt-[18px] max-w-[44ch] text-[17px] leading-[26px] text-content-secondary">
        {WELCOME_COPY.lede}
      </p>

      <div className="mt-9 flex flex-col gap-2.5">
        <Link href="/signin/email" className={buttonVariants({ variant: 'primary' })}>
          {WELCOME_COPY.primary}
        </Link>
        <Link href="/signin" className={buttonVariants({ variant: 'outline' })}>
          {WELCOME_COPY.secondary}
        </Link>
        <Link href="/onboarding" className={buttonVariants({ variant: 'ghost' })}>
          {WELCOME_COPY.learn}
        </Link>
      </div>

      <p className="mx-auto mt-6 max-w-[42ch] type-body-small text-content-tertiary">
        {WELCOME_COPY.browse.before}
        <Link href="/" className="font-semibold text-content-secondary hover:underline">
          {WELCOME_COPY.browse.link}
        </Link>
        {WELCOME_COPY.browse.after}
      </p>

      <div className="mt-5">
        <TermsNotice verb="continuing" />
      </div>

      <p className="mt-4 text-xs leading-4 text-content-tertiary">{APP_INFO.tagline}</p>
    </div></GuestOnlyGate>
  )
}
