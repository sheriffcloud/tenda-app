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

/**
 * The two proof classes. A FILE proof is an uploaded asset — its substance is
 * a Cloudinary `url` and the platform never looks inside it. A DATA proof is
 * a `payload` the server CAN read: geotag is verified geometrically against
 * the gig's declared radius, structured is conformance-checked against the
 * gig's declared fields, text is presence-checked. Only geotag earns the word
 * "verified" — structured/text contents are judged by the poster, not us.
 *
 * PROOF_TYPES is DERIVED from the two classes, so they partition it by
 * construction — a new type lands in exactly one class or it does not exist.
 * Append only (file types before data types is the frozen historical order):
 * the Postgres enum migrates by ADD VALUE, and normalise order below is
 * stored order.
 */
export const FILE_PROOF_TYPES = ['image', 'video', 'document'] as const
export const DATA_PROOF_TYPES = ['geotag', 'text', 'structured'] as const

export const PROOF_TYPES = [...FILE_PROOF_TYPES, ...DATA_PROOF_TYPES] as const

export type ProofType = (typeof PROOF_TYPES)[number]
export type FileProofType = (typeof FILE_PROOF_TYPES)[number]
export type DataProofType = (typeof DATA_PROOF_TYPES)[number]

export function isFileProofType(type: ProofType): type is FileProofType {
  return (FILE_PROOF_TYPES as readonly ProofType[]).includes(type)
}

export function isDataProofType(type: ProofType): type is DataProofType {
  return (DATA_PROOF_TYPES as readonly ProofType[]).includes(type)
}

/**
 * Stable retry identity for an attached proof: file proofs by url, data
 * proofs by canonicalised payload — so re-sending the same evidence (a retry,
 * a double tap) is a no-op in both classes, and two payloads that differ only
 * in key order compare equal.
 */
export function proofIdentity(proof: {
  type: ProofType
  /** Absent and null mean the same thing: a data proof, identified by payload. */
  url?: string | null
  payload?: unknown
}): string {
  return `${proof.type}\0${proof.url ?? canonicalJson(proof.payload ?? null)}`
}

/**
 * JSON with object keys sorted recursively — the canonical form behind
 * `proofIdentity`, matching Postgres jsonb equality (which is key-order
 * blind). Only ever fed proof payloads: plain data, no cycles.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
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
  geotag: 'Location check-in',
  text: 'Written answer',
  structured: 'Structured data',
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
