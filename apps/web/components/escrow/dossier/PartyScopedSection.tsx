/**
 * The half of the dossier that only PARTIES may see (Tier 2 comp: "party-
 * scoped: only rendered here, never on the public page").
 *
 * Enforcement is the SERVER's — lib/escrow-detail-scope.ts nulls these fields
 * for anyone who is not a party, so the anonymous SSR render never receives
 * them. This component's job is to render nothing when they are absent and,
 * critically, never to synthesise a stand-in: an "Unknown counterparty" row
 * would tell an outsider that a counterparty exists, which is the very fact
 * being withheld.
 *
 * The counterparty is the shared PersonCard (#51): profile link, rating,
 * standing and the message-in-context affordance — the dossier was the one
 * surface drawing a counterparty as a name you could not act on. The caller
 * resolves the PERSPECTIVE (the creator sees the Worker, the worker sees the
 * poster) and says what the card's role line reads.
 *
 * Reviews are deliberately NOT here. They are public on purpose.
 */
import type { ReactNode } from 'react'
import { formatRelativeDayWithTime, type ProofPayloadLine } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PersonCard, type PersonCardUser } from '@/components/shared/PersonCard'
import type { EscrowChatContext } from '@/lib/chat-href'
import { DossierProofList } from './DossierProofList'
import { DOSSIER_COPY } from './copy'

export interface DossierProof {
  id: string
  label: string
  /** ISO; formatted for display by the section, never printed raw. */
  uploadedAt?: string | null
  /**
   * Where the file itself is. A party approving or disputing has to be able to
   * OPEN the evidence — a list that only says one exists is the half of the
   * information that cannot settle anything.
   */
  href?: string | null
  /**
   * A data proof's payload as display lines (shared proofPayloadLines) —
   * its substance, since there is no file to open. Null on file proofs.
   */
  payloadLines?: readonly ProofPayloadLine[] | null
}

export interface PartyScopedProps {
  /**
   * The OTHER party from the viewer's seat, already resolved by the caller.
   * `null` for an outsider, and for the anonymous SSR render.
   */
  counterparty?: PersonCardUser | null
  /** The card's role line — 'Worker' to the creator, 'Posted by' to the worker. */
  counterpartyLabel?: string
  /** The viewer, for the card's self/other split. '' while identity loads. */
  viewerId?: string
  /** Escrow context the message link carries. */
  chatContext?: EscrowChatContext
  proofs?: readonly DossierProof[] | null
  /** A self-labelling notice (DisputeNotice) — no extra heading is added. */
  dispute?: ReactNode | null
  /**
   * True when a direct invite names someone. Party-only on the wire, so an
   * outsider gets `false` and sees nothing.
   */
  isAssigned?: boolean
  /** Shared with the timeline, so one escrow stamps its events one way. */
  formatStamp?: (iso: string) => string
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Eyebrow as="h3" className="mb-4">
      {children}
    </Eyebrow>
  )
}

export function PartyScopedSection({
  counterparty = null,
  counterpartyLabel = DOSSIER_COPY.counterparty,
  viewerId = '',
  chatContext,
  proofs = null,
  dispute = null,
  isAssigned = false,
  formatStamp = formatRelativeDayWithTime,
}: PartyScopedProps) {
  const hasCounterparty = counterparty !== null && counterparty !== undefined
  const hasProofs = proofs !== null && proofs !== undefined
  const hasDispute = dispute !== null && dispute !== undefined

  // Nothing party-scoped survived the server's scoping: render NOTHING, not
  // an empty shell that leaks the shape of what is hidden.
  if (!hasCounterparty && !hasProofs && !hasDispute && !isAssigned) return null

  return (
    <section className="mt-9 border-t border-border-subtle pt-7" data-party-scoped>
      {/* No heading: the card's role line IS the label, as PartyPanel and
          mobile draw it — a "Counterparty" eyebrow over a "Worker" card said
          the same thing twice. */}
      {hasCounterparty && (
        <div className="mb-7">
          <PersonCard
            user={counterparty}
            label={counterpartyLabel}
            currentUserId={viewerId}
            context={chatContext}
          />
        </div>
      )}

      {/* Assigned but unnamed: a party may know the gig is taken without the
          assignee being resolvable on this wire. */}
      {!hasCounterparty && isAssigned && (
        <p className="mb-7 type-body-small text-content-secondary">
          {DOSSIER_COPY.assignedUnnamed}
        </p>
      )}

      {hasProofs && (
        <div className="mb-7">
          <Heading>{DOSSIER_COPY.proofs}</Heading>
          {/* Extracted rows (#48): the gig detail's party panel renders the
              same list, so one escrow's evidence dresses one way. */}
          <DossierProofList proofs={proofs} formatStamp={formatStamp} />
        </div>
      )}

      {hasDispute && dispute}
    </section>
  )
}
