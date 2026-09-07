/**
 * Proof-type vocabulary — the single source for the `proof_type` Postgres
 * enum, the server's upload validator, and the mobile file picker. Declared
 * here rather than in the schema so `db/schema/escrow.ts` derives its enum
 * from this tuple and the three surfaces cannot drift.
 *
 * A poster may REQUIRE a subset of these on a gig (`gig_details
 * .proof_requirements`); the worker's submit is refused until every required
 * type is present. Enforcement is app-level: the on-chain `submitProof`
 * carries only a digest and checks none of this.
 */

export const PROOF_TYPES = ['image', 'video', 'document'] as const

export type ProofType = (typeof PROOF_TYPES)[number]

/** Stable retry identity for an already-uploaded proof asset. */
export function proofIdentity(proof: { url: string; type: ProofType }): string {
  return `${proof.type}\0${proof.url}`
}

export function isProofType(value: unknown): value is ProofType {
  return typeof value === 'string' && (PROOF_TYPES as readonly string[]).includes(value)
}

/**
 * User-facing names. 'image' reads as "Photo" to a worker holding a phone —
 * the wire value stays `image` because that is what the picker and the DB
 * enum use.
 */
export const PROOF_TYPE_LABEL: Record<ProofType, string> = {
  image: 'Photo',
  video: 'Video',
  document: 'Document',
}

/**
 * Requiring every type is legal but is the practical ceiling — the array is
 * a deduplicated subset of PROOF_TYPES, so it can never usefully be longer.
 */
export const MAX_PROOF_REQUIREMENTS = PROOF_TYPES.length

/** Total uploaded evidence items retained for one escrow. */
export const MAX_ESCROW_PROOFS = 20

/**
 * Normalise a caller-supplied requirement list: drop duplicates and return
 * them in PROOF_TYPES order so two equivalent requests store identically
 * (a poster picking video-then-photo must not differ from photo-then-video).
 * Assumes every entry is already a valid ProofType — validate first.
 */
export function normaliseProofRequirements(
  requirements: readonly ProofType[],
): ProofType[] {
  return PROOF_TYPES.filter((t) => requirements.includes(t))
}

/**
 * Human-readable list of proof types ("photo", "photo and video",
 * "photo, video and document"). Shared so the server's rejection message and
 * the app's checklist word the same requirement identically — they read as
 * one product voice, and neither can drift into its own phrasing.
 */
export function formatProofTypeList(types: readonly ProofType[]): string {
  const labels = types.map((t) => PROOF_TYPE_LABEL[t].toLowerCase())
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Required types with no matching proof attached. Empty result = satisfied,
 * which is also the answer for a gig that requires nothing.
 */
export function missingProofTypes(
  required: readonly ProofType[],
  attached: readonly { type: ProofType }[],
): ProofType[] {
  const present = new Set(attached.map((p) => p.type))
  return required.filter((t) => !present.has(t))
}
