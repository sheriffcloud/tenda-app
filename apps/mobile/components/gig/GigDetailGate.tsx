/**
 * Loads one gig by id and renders its screen only once there is something to
 * render — otherwise the loading, error or not-found state.
 *
 * Shared by the gig detail and the applicant shortlist, which had the same
 * four-branch preamble each. `requireCreator` covers the second one: the
 * shortlist route is poster-only server-side, so rendering it for anyone else
 * would paint a screen whose every request 403s.
 */
import { useCallback, type ReactNode } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import type { GigDetail } from '@tenda/shared'
import { ScreenContainer, EmptyState } from '@/components/ui'
import { LoadingScreen, ErrorState } from '@/components/feedback'
import { useAuthStore, useGigsStore } from '@/stores'

interface Props {
  id: string | undefined
  /** Poster-only screens: anyone else gets the not-available state. */
  requireCreator?: boolean
  children: (gig: GigDetail, userId: string) => ReactNode
}

function FullScreenState({ children }: { children: ReactNode }) {
  return (
    <ScreenContainer scroll={false} padding={false}>
      {children}
    </ScreenContainer>
  )
}

export function GigDetailGate({ id, requireCreator = false, children }: Props) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { selectedGig, error, fetchGigDetail } = useGigsStore()

  useFocusEffect(
    useCallback(() => {
      if (id) void fetchGigDetail(id)
    }, [id]), // eslint-disable-line react-hooks/exhaustive-deps
  )

  // The store holds ONE `selectedGig`, so navigating between gigs leaves the
  // previous one in it until the new fetch lands. Matching on the id first
  // means a stale gig is never rendered — which since Stage 10 would mean
  // showing another gig's `viewer` block, e.g. "Withdraw application" on a gig
  // this user never applied to.
  const gig = selectedGig?.escrow_id === id ? selectedGig : null
  // Only an error raised for THIS id; the store's slot is shared by every gig.
  const failure = error !== null && error.id === id ? error : null

  // A function, not a value: the happy path returns `children` and would
  // otherwise build this element on every render only to discard it.
  const notAvailable = () => (
    <FullScreenState>
      <EmptyState
        title="Gig not available"
        description="This gig may have been removed, or is no longer public."
        action={{ label: 'Go back', onPress: () => router.back() }}
      />
    </FullScreenState>
  )

  // Unreadable for good — deleted, or a draft/takedown this viewer may not see.
  // Gets the not-available state rather than "Failed to load", because Retry
  // here would fail every time it was tapped.
  if (gig === null && failure?.gone === true) return notAvailable()

  if (gig === null && failure !== null) {
    return (
      <FullScreenState>
        <ErrorState
          title="Failed to load gig"
          description={failure.message}
          ctaLabel="Retry"
          onCtaPress={() => id && void fetchGigDetail(id)}
        />
      </FullScreenState>
    )
  }

  // No id at all is the only way to have nothing to load; anything else is
  // still in flight (the fetch runs from an effect, i.e. after this render).
  if (gig === null) {
    if (id !== undefined) return <LoadingScreen />
    return notAvailable()
  }

  if (requireCreator && gig.creator.id !== user?.id) {
    return (
      <FullScreenState>
        <EmptyState
          title="Not available"
          description="Only the poster can see who applied to a gig."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </FullScreenState>
    )
  }

  return <>{children(gig, user?.id ?? '')}</>
}
