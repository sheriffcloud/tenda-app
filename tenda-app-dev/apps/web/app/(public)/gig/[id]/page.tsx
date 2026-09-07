import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { APP_INFO, formatAssetAmount, gigPlaceLabel } from '@tenda/shared'
import { GigEscrowAside } from '@/components/gig/detail/GigEscrowAside'
import { GigListingArticle } from '@/components/gig/detail/GigListingArticle'
import { GigUnavailable } from '@/components/gig/detail/GigUnavailable'
import { getGig } from '@/lib/gigs/data'

type Params = { params: Promise<{ id: string }> }

/**
 * OG tags come from the SAME cached fetch that renders the body (getGig is
 * wrapped in React cache). These links get pasted into WhatsApp — the unfurl
 * is the front door.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  // A read FAILURE must not throw out of here: `generateMetadata` runs
  // before the page, and a throw errors the whole route into the client
  // boundary — which is the blank page the page below exists to avoid.
  const gig = await getGig(id).catch(() => 'unavailable' as const)
  if (gig === 'unavailable') {
    return { title: 'Gig unavailable', robots: { index: false, follow: true } }
  }
  if (gig === null) return { title: 'Gig not found' }
  const amount = formatAssetAmount(gig.amount_raw, gig.asset)
  const where = gigPlaceLabel(gig)
  const description =
    gig.description !== null && gig.description !== ''
      ? gig.description.slice(0, 160)
      : `${amount} escrow-secured gig on ${APP_INFO.name} · ${where}`
  const url = `/gig/${gig.escrow_id}`
  return {
    title: gig.title,
    description,
    // The id in the path is the gig's whole identity, so this is always
    // self-referencing — its job is to absorb the tracking params these links
    // pick up in transit (they get pasted into WhatsApp, which appends its
    // own) rather than to point somewhere else.
    alternates: { canonical: url },
    openGraph: {
      title: gig.title,
      description,
      url,
      siteName: APP_INFO.name,
      type: 'article',
    },
    twitter: { card: 'summary_large_image' },
  }
}

/**
 * Tier-1 public detail (comp lines 547-683). Anonymous fetch by construction;
 * a hidden or unknown gig 404s (Next adds noindex to 404 responses).
 * Party-scoped fields are never read by anything on this page — see GigTerms.
 */
export default async function GigDetailPage({ params }: Params) {
  const { id } = await params
  // `notFound()` throws, so it stays OUTSIDE the catch: a missing gig is a
  // real 404 that Next renders server-side, and only an outage lands here.
  const gig = await getGig(id).catch(() => 'unavailable' as const)
  if (gig === 'unavailable') return <GigUnavailable href={`/gig/${id}`} />
  if (gig === null) notFound()

  return (
    <div className="bg-surface-inset/40">
      <div className="mx-auto w-full max-w-content px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_344px] lg:gap-8">
          {/* No `min-w-0` here, deliberately: it was tried and measured to make
              no difference. This column is held by `minmax(0,1fr)` above at the
              two-column breakpoint, and at the single-column one by the fact
              that every poster-written block inside it can break (GigTerms,
              GigDetailHeader, GigBrief). The constraint that IS load-bearing
              lives on the feed card — see GigCard. */}
          <GigListingArticle gig={gig} />

          <GigEscrowAside gig={gig} />
        </div>
      </div>
    </div>
  )
}
