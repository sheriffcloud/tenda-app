/**
 * Gig DETAIL store — verbatim port of apps/mobile/stores/gigs.store.ts.
 * DISPLAY ONLY post-#34: detail comes from /v1/gigs/:id; every lifecycle
 * transition goes through the escrow store + wallet dispatch. The one
 * off-chain action kept here is the post-completion review.
 */
import { create } from 'zustand'
import type { GigDetail, ReviewInput } from '@tenda/shared'
import { api } from '@/api/client'
import { classifyDetailLoadError, type DetailLoadError } from '@tenda/shared'
import { registerAccountReset } from '@/lib/account-state'

/**
 * A failed load, and WHICH gig it was for. The id is carried inside the
 * error: this store holds one slot for every gig, so a bare message cannot
 * say what failed.
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
  /** Drop the held gig — see the registration at the foot of this file. */
  reset: () => void
}

const EMPTY = { selectedGig: null, isLoading: false, error: null } as const

/**
 * Which fetch is allowed to write. Bumped on every call; a response whose
 * token is no longer the latest is DISCARDED, success or failure alike — one
 * slot serves every gig, so a late response is about a different subject.
 */
let latestRequest = 0

export const useGigsStore = create<GigsState>((set) => ({
  ...EMPTY,

  fetchGigDetail: async (id) => {
    const request = ++latestRequest
    set((state) => ({
      isLoading: true,
      error: null,
      // Drop a gig that is not the one being loaded — holding it while a
      // different id is in flight is what let a screen render the previous
      // gig (and, since approval mode, the previous VIEWER's actions).
      selectedGig: state.selectedGig?.escrow_id === id ? state.selectedGig : null,
    }))
    try {
      const gig = await api.gigs.get({ id })
      if (request !== latestRequest) return
      set({ selectedGig: gig, isLoading: false })
    } catch (e) {
      if (request !== latestRequest) return
      const failure = classifyDetailLoadError(e)
      // A `gone` refetch DROPS the gig it was refreshing — a gig deleted or
      // taken down mid-session must not keep rendering with live buttons. A
      // transient failure deliberately does NOT drop it.
      set((state) => ({
        error: { id, ...failure },
        isLoading: false,
        selectedGig:
          failure.gone && state.selectedGig?.escrow_id === id ? null : state.selectedGig,
      }))
    }
  },

  reset: () => {
    // Bumping the token is the half that is easy to miss: emptying the slot
    // does not stop a request that is already on its way, and `fetchGigDetail`
    // discards a response only when a LATER call has superseded it. Signing
    // out is not a later call, so without this the previous account's gig
    // lands back in the store a moment after being dropped.
    latestRequest += 1
    set(EMPTY)
  },

  reviewEscrow: async (id, input) => {
    set({ isLoading: true })
    try {
      await api.escrows.review({ id }, input)
      set({ isLoading: false })
    } catch (e) {
      set({ isLoading: false })
      throw e
    }
  },
}))

/**
 * ACCOUNT-SCOPED, and not obviously so — which is why it was missed until #25.
 * `selectedGig` is a `GigDetail`, and that type carries the PARTY-SCOPED half
 * of the escrow: `counterparty`, `proofs`, `dispute` and `viewer`. Across a
 * same-tab account switch that data stays in memory and is handed to whatever
 * mounts next — and `fetchGigDetail` deliberately KEEPS the held gig when the
 * next reader opens the same id, so it is what paints until the refetch lands.
 *
 * Be precise about the exposure, because overstating it is how a real fix gets
 * argued down later: the components that render this half (`PartyPanel`,
 * `GigEscrowActions`, `TakedownNotice`) each take the CURRENT viewer's id and
 * show nothing when that viewer is not a party, so today the retained data is
 * not on screen. That is a second line of defence in the consumers, not a
 * property of this store, and it is one careless `gig.counterparty` away from
 * being the only one. The store should not be holding another account's
 * private view of a deal at all.
 *
 * `latestRequest` needs no reset: it only ever increases, and a token from the
 * previous session can never equal a later one.
 */
registerAccountReset(() => useGigsStore.getState().reset())
