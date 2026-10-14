/**
 * Gig DETAIL store, DISPLAY ONLY post-#34. Detail comes from the read
 * surface (/v1/gigs/:id over escrows ⨝ gig_details); every lifecycle
 * transition goes through the escrow store + wallet dispatch
 * (signSendAndReport). The one off-chain action kept here is the
 * post-completion review.
 *
 * The browse LIST is deliberately not here: it is paginated, filter-scoped
 * and screen-local, so it lives in `usePaginatedList` via `useHomeFeed`.
 * Holding a single global page of gigs was what let a background poll
 * collapse the user's scrolled pages.
 */
import { create } from 'zustand'
import {
  accountGeneration,
  classifyDetailLoadError,
  isSameAccount,
  registerAccountReset,
  type DetailLoadError,
  type GigDetail,
  type ReviewInput,
} from '@tenda/shared'
import { api } from '@/api/client'

/**
 * A failed load, and WHICH gig it was for.
 *
 * The id is carried inside the error rather than beside it: this store holds
 * one slot for every gig, so a bare message cannot say what failed, and after
 * any failure opening a different gig would show the previous one's error for
 * the frame before its own fetch starts. One object instead of three
 * independently-nullable fields that must be read together to mean anything.
 */
export interface GigLoadError extends DetailLoadError {
  id: string
}

interface GigsState {
  selectedGig: GigDetail | null
  isLoading: boolean
  error: GigLoadError | null

  fetchGigDetail: (id: string) => Promise<void>
  reviewEscrow: (id: string, input: ReviewInput) => Promise<void>
}

/**
 * Which fetch is allowed to write. Bumped on every call; a response whose token
 * is no longer the latest is DISCARDED, success or failure alike.
 *
 * One slot serves every gig, so a response that arrives after a newer request
 * started is not merely stale, it is about a different subject. Both directions
 * ended in the same dead screen: a late SUCCESS for gig-1 replaced gig-2 (the
 * gate renders only when the id matches, so it showed a spinner), and a late
 * FAILURE overwrote gig-2's error slot (the gate ignores another gig's error,
 * so it showed a spinner). Either way: no data, no error, nothing in flight,
 * and no way out but leaving the screen.
 *
 * Module scope rather than store state: it is bookkeeping about requests, not
 * something any screen should be able to read or render.
 */
let latestRequest = 0

export const useGigsStore = create<GigsState>((set) => ({
  selectedGig: null,
  isLoading: false,
  error: null,

  fetchGigDetail: async (id) => {
    // Two different questions, both needed. `latestRequest` answers "did a
    // newer fetch supersede this one"; the generation answers "does this
    // response belong to a previous ACCOUNT" — which a sign-out is, and which
    // a per-store request token cannot express (#65).
    const gen = accountGeneration()
    const request = ++latestRequest
    set((state) => ({
      isLoading: true,
      error: null,
      // Drop a gig that is not the one being loaded. Holding it while a
      // different id is in flight is what let a screen render the previous
      // gig — and, since approval mode, the previous VIEWER's actions.
      selectedGig: state.selectedGig?.escrow_id === id ? state.selectedGig : null,
    }))
    try {
      const gig = await api.gigs.get({ id })
      if (!isSameAccount(gen)) return
      // Superseded: a newer fetch owns the slot, so this response writes
      // nothing at all. `isLoading` is included in that for consistency rather
      // than for effect — NOTHING reads it today (`GigDetailGate` decides on
      // selectedGig/error/id alone, and it is the store's only detail reader),
      // so the load-bearing half of this guard is the two slots below it.
      if (request !== latestRequest) return
      set({ selectedGig: gig, isLoading: false })
    } catch (e) {
      // The failure path writes as much as the success path does — an error
      // banner naming a gig, and a possible null of the slot — so guarding only
      // the success half would let a stale 404 report the previous account's
      // gig as gone on the next account's screen.
      if (!isSameAccount(gen)) return
      if (request !== latestRequest) return
      const failure = classifyDetailLoadError(e)
      // A `gone` refetch DROPS the gig it was refreshing. Without this, a gig
      // deleted or taken down mid-session kept rendering from the previous
      // response — pull-to-refresh 404ing quietly while every action button
      // stayed live — because the screen only shows an error when the slot is
      // empty. A transient failure deliberately does NOT drop it: blanking a
      // good screen on one lost packet is the opposite mistake.
      set((state) => ({
        error: { id, ...failure },
        isLoading: false,
        selectedGig:
          failure.gone && state.selectedGig?.escrow_id === id ? null : state.selectedGig,
      }))
    }
  },

  reviewEscrow: async (id, input) => {
    // `isLoading` is shared with fetchGigDetail, so a review that settles after
    // a sign-out would switch off a spinner the NEXT account's detail load put
    // up. The caller still gets its rejection: the guard suppresses the write,
    // not the throw.
    const gen = accountGeneration()
    set({ isLoading: true })
    try {
      await api.escrows.review({ id }, input)
      if (!isSameAccount(gen)) return
      set({ isLoading: false })
    } catch (e) {
      if (isSameAccount(gen)) set({ isLoading: false })
      throw e
    }
  },
}))

// `selectedGig` carries the viewer block — the previous account's Apply /
// Withdraw state — so a leftover is a wrong ACTION offered, not just stale text.
registerAccountReset(() =>
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null }),
)
