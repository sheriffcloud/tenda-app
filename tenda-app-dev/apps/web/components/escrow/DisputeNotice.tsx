import Link from 'next/link'

/**
 * The ONE dispute affordance an escrow detail carries: the reason, and the
 * party-only way into the mediation thread (mobile's DisputeReasonBlock).
 *
 * Promoted out of components/exchange (spec-correction #51): the gig party
 * panel had grown its own near-copy, and the workspace dossier — where every
 * dispute notification lands a party since #49 — had neither. One component,
 * three surfaces, so a dispute reads the same wherever it is met.
 */
export const DISPUTE_NOTICE_COPY = {
  title: 'Dispute raised',
  openThread: 'Open the mediation thread',
} as const

export function DisputeNotice({
  reason,
  escrowId,
  isParty,
}: {
  reason: string
  escrowId: string
  /** The thread is parties-only; outsiders get the reason without a door. */
  isParty: boolean
}) {
  return (
    <section className="flex flex-col gap-1 rounded-card border border-feedback-warning-base/40 bg-feedback-warning-surface p-4">
      <h2 className="text-sm font-semibold text-feedback-warning-text">
        {DISPUTE_NOTICE_COPY.title}
      </h2>
      <p className="text-sm text-feedback-warning-text/90">{reason}</p>
      {isParty && (
        <Link
          href={`/dispute/${escrowId}`}
          className="text-sm font-semibold text-brand-primary underline-offset-2 hover:underline"
        >
          {DISPUTE_NOTICE_COPY.openThread}
        </Link>
      )}
    </section>
  )
}
