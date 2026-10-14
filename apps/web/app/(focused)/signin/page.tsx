import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Wallet } from 'lucide-react'
import { APP_INFO } from '@tenda/shared'
import { AuthMethodCard } from '@/components/auth/AuthMethodCard'
import { AuthPanel } from '@/components/auth/AuthPanel'
import { TermsNotice } from '@/components/auth/TermsNotice'
import { AUTH_COPY } from '@/components/auth/copy'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { readReturnParam, withReturnPath } from '@/lib/auth/return-path'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
}

/**
 * Method chooser — the web analogue of mobile's get-started.
 *
 * Email creates accounts; a wallet only signs an existing one in (decision #3,
 * server-enforced), and each card says so rather than presenting two
 * interchangeable buttons. Phone and Google are provisioned server-side and
 * deliberately deferred (stage-2 doc), so they are absent rather than shown
 * disabled — a greyed-out method reads as broken, not as unfinished.
 *
 * Server-rendered: nothing here needs a session or the bundle, and it is the
 * page a reader most often reaches on a cold connection.
 *
 * DYNAMIC rather than statically prerendered, since #27 — reading
 * `searchParams` for the return path opts the route out, and the build marks
 * it `ƒ` where every sibling auth page is still `○`. Kept that way on
 * purpose: the alternative is to stay static and upgrade the two hrefs on the
 * client after hydration, which gets them WRONG for anyone who clicks before
 * the bundle lands — longest on exactly the slow connections the paragraph
 * above cares about. The page fetches nothing, so dynamic costs a render of
 * static markup rather than a round trip to anything.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Where AuthGate was sending them. Carried on to whichever method they pick
  // so the destination survives the whole flow (#27).
  const next = readReturnParam((await searchParams).next)
  return (
    <AuthPanel title={AUTH_COPY.chooser.title} lede={AUTH_COPY.chooser.lede}>
      <div className="flex flex-col gap-2.5">
        <AuthMethodCard
          href={withReturnPath('/signin/email', next)}
          icon={Mail}
          label={AUTH_COPY.chooser.email.label}
          hint={AUTH_COPY.chooser.email.hint}
        />
        <AuthMethodCard
          href={withReturnPath('/signin/wallet', next)}
          icon={Wallet}
          label={AUTH_COPY.chooser.wallet.label}
          hint={AUTH_COPY.chooser.wallet.hint}
        />
      </div>

      {/* The comp's "or" rule. Decorative, so the text is hidden from the
          accessibility tree — a screen reader reading "or" between two links
          and a third gains nothing from it. */}
      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border-default" />
        <Eyebrow as="span">or</Eyebrow>
        <span className="h-px flex-1 bg-border-default" />
      </div>

      {/* The whole feed is public, so this is a real third option and not a
          consolation prize — it is the one path that needs no account at all. */}
      <Link
        href="/"
        className="flex min-h-12 items-center justify-center rounded-control border border-border-default px-4 type-button text-content-secondary hover:bg-surface-inset hover:text-content-primary"
      >
        {AUTH_COPY.chooser.browse}
      </Link>

      <div className="mt-5">
        <TermsNotice verb="continuing" />
      </div>

      {/* Named so a reader can tell where "we" is, without leaving the flow. */}
      <p className="mt-4 text-center text-xs leading-4 text-content-tertiary">
        {AUTH_COPY.chooser.help}{' '}
        <a
          href={`mailto:${APP_INFO.support.email}`}
          className="font-semibold text-content-secondary hover:underline"
        >
          {APP_INFO.support.email}
        </a>
      </p>
    </AuthPanel>
  )
}
