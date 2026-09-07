'use client'

/**
 * The party's way into a gig the ANONYMOUS page cannot serve.
 *
 * /gig/[id] SSRs anonymously by construction, so drafts and CO1 takedowns —
 * which the server serves ONLY to their parties — are an HTTP 404 there,
 * and must stay one: the anonymous 404 (with noindex) IS the takedown
 * contract for crawlers and strangers. This component rides that not-found
 * boundary: it bootstraps the stored session and retries the SAME endpoint
 * with the bearer. A party gets their gig (draft repost, hidden-escrow
 * operations) in place of the not-found copy; everyone else keeps it.
 */
import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { formatAssetAmount } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useGigsStore } from '@/stores/gigs.store'
import { GigDetailAuthed } from './GigDetailApp'

export function PrivateGigRescue({ fallback }: { fallback: ReactNode }) {
  const pathname = usePathname()
  const match = pathname?.match(/^\/gig\/([^/]+)$/)
  const id = match?.[1]

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isLoading = useAuthStore((s) => s.isLoading)
  const loadSession = useAuthStore((s) => s.loadSession)
  const selectedGig = useGigsStore((s) => s.selectedGig)
  const fetchGigDetail = useGigsStore((s) => s.fetchGigDetail)

  useEffect(() => {
    if (isLoading) void loadSession()
  }, [isLoading, loadSession])

  useEffect(() => {
    if (isAuthenticated && id !== undefined) void fetchGigDetail(id)
  }, [isAuthenticated, id, fetchGigDetail])

  const gig = id !== undefined && selectedGig?.escrow_id === id ? selectedGig : null

  // Not a party (or genuinely gone): the not-found copy stands.
  if (gig === null || userId === null) return <>{fallback}</>

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
          {gig.status === 'draft' ? 'Draft — not published yet' : 'Visible to you as a party'}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-content-primary">
          {gig.title}
        </h1>
        <p className="text-sm text-content-secondary">
          {formatAssetAmount(gig.amount_raw, gig.asset)} escrow
        </p>
      </header>
      <GigDetailAuthed gig={gig} userId={userId} />
    </article>
  )
}
