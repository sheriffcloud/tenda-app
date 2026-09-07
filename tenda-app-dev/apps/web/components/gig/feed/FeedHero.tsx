/**
 * The public feed's hero — the front door for an anonymous visitor.
 *
 * ONE COMPACT BAND (#60, correction a): tendahq's type and rhythm — the h1
 * ending on the blue period, one lede, two CTAs — carrying the web landing's
 * OWN three strings, and none of tendahq's hero objects: no stamps, no
 * example receipt, no marketing stat row. The feed is this page's object,
 * and the first gigs sit above the fold at 1280×800 (measured in e2e).
 *
 * EVERY string here comes from shared `APP_INFO`, each in the role that
 * file documents for it: the tagline as the brand line, the description as
 * the product summary (VERBATIM — it is derived, never reworded), the
 * guarantee as the specific right a worker gets. Nothing is retyped —
 * `packages/shared/test/constants/pitch-strings.test.ts` fails if an app
 * hardcodes a value shared already owns. `APP_INFO.guarantee` is the STATIC
 * form of the window, sanctioned for surfaces with no config.
 */
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { APP_INFO } from '@tenda/shared'
import { BrandPeriod } from '@/components/public/BrandPeriod'
import { buttonVariants } from '@/components/ui/Button'
import { FEED_COPY } from './copy'

export const FEED_HERO_HREF = { post: '/create', how: '/support/escrow' } as const

export function FeedHero() {
  return (
    <section
      data-feed-hero
      className="mx-auto grid w-full max-w-content items-center gap-x-8 gap-y-5 px-6 pb-[26px] pt-[30px] lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <h1 className="type-h1 text-balance text-content-primary">
          <BrandPeriod text={APP_INFO.tagline} />
        </h1>
        <p className="mt-2.5 max-w-[62ch] type-body text-content-secondary">
          {APP_INFO.description}
        </p>
        <p className="mt-1.5 max-w-[56ch] type-body-small text-content-tertiary">
          {APP_INFO.guarantee}
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5 lg:justify-end">
        <Link href={FEED_HERO_HREF.post} className={buttonVariants({ variant: 'primary', size: 'md' })}>
          {FEED_COPY.cta.post}
          <ArrowRight size={15} aria-hidden />
        </Link>
        <Link href={FEED_HERO_HREF.how} className={buttonVariants({ variant: 'outline', size: 'md' })}>
          {FEED_COPY.cta.how}
        </Link>
      </div>
    </section>
  )
}
