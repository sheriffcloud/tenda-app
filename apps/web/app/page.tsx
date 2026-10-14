import { SiteHeader } from '@/components/public/SiteHeader'
import { SiteFooter } from '@/components/public/SiteFooter'
import PublicGigFeedPage, { generateMetadata } from '@/components/gig/feed/PublicGigFeedPage'
import type { RawSearchParams } from '@/lib/gigs/search-params'

export { generateMetadata }

export default async function RootPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="flex-1"><PublicGigFeedPage searchParams={searchParams} /></main><SiteFooter /></div>
}
