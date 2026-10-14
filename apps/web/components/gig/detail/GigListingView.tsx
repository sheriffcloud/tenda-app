/**
 * The ONE authed listing composition inside the workspace shell: the shared
 * article, the money aside, and the session's action island.
 *
 * Extracted from HomeGigDetail (2026-08-24, spec-correction #49) the moment a
 * second consumer existed: /my-gigs/[id] renders this exact body for a viewer
 * who is NOT a party — a subscriber opening a new-gig notice, an applicant
 * from the Applied tab — because the dossier is party furniture and carries no
 * brief. Two consumers, one definition; the public /gig/[id] page composes
 * the same article and aside itself because its wrapper is the SSR/anonymous
 * boundary, not a session-scoped pane.
 */
import type { GigDetail } from '@tenda/shared'
import { GigDetailAuthed } from './GigDetailApp'
import { GigEscrowAside } from './GigEscrowAside'
import { GigListingArticle } from './GigListingArticle'

export function GigListingView({ gig, userId }: { gig: GigDetail; userId: string | null }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-8 lg:px-8">
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GigListingArticle gig={gig} revealParties />
        <div className="flex flex-col gap-4">
          <GigEscrowAside
            gig={gig}
            // `null` (not undefined): the aside must NOT fall back to the
            // public sign-in island while the session is still loading.
            actions={userId === null ? null : <GigDetailAuthed gig={gig} userId={userId} />}
          />
        </div>
      </div>
    </div>
  )
}
