/**
 * The /gigs surface's narrowing — a category and a search — shared between
 * the two views of one list (#60): the list column rendered in the `@list`
 * slot and the full-pane card grid rendered by the page. They sit in two
 * different React trees, so a filter typed in one must reach the other
 * through a store, not props; and the column is remounted on every row the
 * reader opens (CLAUDE.md, "a remount is the normal case"), so the filter
 * cannot live in the column either.
 *
 * NOT persisted and NOT account-scoped: it narrows the PUBLIC open-gig feed
 * (the same rows for every reader), it holds nothing personal, and a filter
 * that outlived the session would only narrow a public list for the next
 * account — which is why the account-scope guard excuses it.
 */
import { create } from 'zustand'
import type { GigCategory } from '@tenda/shared'

interface GigsBrowseState {
  category: GigCategory | null
  q: string
  setCategory: (category: GigCategory | null) => void
  setQ: (q: string) => void
}

export const useGigsBrowseStore = create<GigsBrowseState>((set) => ({
  category: null,
  q: '',
  setCategory: (category) => set({ category }),
  setQ: (q) => set({ q }),
}))
