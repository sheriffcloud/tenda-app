/**
 * The submitted-proofs rows, extracted from PartyScopedSection (2026-08-24,
 * spec-correction #48) so the gig detail's party panel renders proofs the
 * SAME way the workspace dossier does — one escrow's evidence must not dress
 * differently per surface.
 */
import {
  PROOF_TYPE_LABEL,
  formatRelativeDayWithTime,
  proofPayloadLines,
  type ProofPayload,
  type ProofType,
} from '@tenda/shared'
import type { DossierProof } from './PartyScopedSection'
import { DOSSIER_COPY } from './copy'

/**
 * Only what the mapper reads. `EscrowProof` is `InferSelectModel` of the
 * Drizzle row, so it types `uploaded_at` as a **Date** — which it is in the
 * database and is NOT over the wire, where JSON has already made it a string.
 * Taking the narrow shape keeps that mismatch in one place.
 */
export interface DossierProofInput {
  id: string
  type: ProofType
  uploaded_at: Date | string | null
  /** Null on data proofs (geotag/text/structured) — the row renders its label
   *  unlinked and the payload below it. */
  url: string | null
  /** The data-proof payload; null/absent on file proofs. */
  payload?: ProofPayload | null
}

/**
 * The wire's proofs in the shape the list reads. Kind-agnostic — the gig
 * dossier, the gig party panel and the exchange detail all feed it — which is
 * why it lives HERE beside its renderer rather than in gig/my-gigs (moved in
 * the #48 review). The label is the shared one, so a proof reads the same
 * everywhere it appears.
 */
export function dossierProofsFor(
  proofs: readonly DossierProofInput[] | null | undefined,
): readonly DossierProof[] | null {
  if (proofs === null || proofs === undefined) return null
  return proofs.map((proof) => ({
    id: proof.id,
    label: PROOF_TYPE_LABEL[proof.type],
    href: proof.url,
    // The shared formatter, so one payload reads the same on every surface
    // (mobile detail, admin gallery).
    payloadLines: proof.payload != null ? proofPayloadLines(proof.payload) : null,
    // Both forms, because the declared type and the runtime value disagree.
    uploadedAt:
      proof.uploaded_at instanceof Date ? proof.uploaded_at.toISOString() : proof.uploaded_at,
  }))
}

export function DossierProofList({
  proofs,
  formatStamp = formatRelativeDayWithTime,
}: {
  proofs: readonly DossierProof[]
  /** Shared with the timeline, so one escrow stamps its events one way. */
  formatStamp?: (iso: string) => string
}) {
  if (proofs.length === 0) {
    return (
      <p className="type-body-small text-content-tertiary">{DOSSIER_COPY.noProofs}</p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {proofs.map((proof) => (
        <li
          key={proof.id}
          className="rounded-control border border-border-subtle bg-surface-card px-4 py-2.5 type-body-small text-content-primary"
        >
          {proof.href == null || proof.href === '' ? (
            proof.label
          ) : (
            // New tab: the file is hosted media, and losing the escrow you
            // are mid-decision on to open it is worse.
            <a
              href={proof.href}
              target="_blank"
              rel="noreferrer"
              className="text-brand-primary underline-offset-2 hover:underline"
            >
              {proof.label}
            </a>
          )}
          {proof.uploadedAt != null && (
            <span className="ml-2 font-numeric type-caption text-content-tertiary">
              {formatStamp(proof.uploadedAt)}
            </span>
          )}
          {/* A data proof's substance IS its payload — rendered, not linked. */}
          {proof.payloadLines != null && proof.payloadLines.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {proof.payloadLines.map((line, index) => (
                <p key={index} className="break-words type-body-small text-content-secondary">
                  {line.label !== null && (
                    <span className="text-content-tertiary">{line.label}: </span>
                  )}
                  {line.value}
                </p>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
