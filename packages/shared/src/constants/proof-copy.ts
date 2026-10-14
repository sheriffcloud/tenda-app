/**
 * What the product SAYS about proof — the sentences both clients show a worker
 * about what a gig requires, what is still missing, and what the escrow already
 * holds.
 *
 * Shared for the same reason `formatProofTypeList` is (see its doc): the server
 * refuses with "This gig requires photo and video proof…", and a client that
 * words the same requirement differently tells one worker the same fact two
 * ways in the same minute. These call into that formatter rather than
 * restating it, so the vocabulary has exactly one owner.
 *
 * What does NOT live here is anything a client's own CONTROLS say — web's
 * "Uploading…"/"Submitting…" button label has no mobile twin on purpose
 * (mobile's Button hides its label behind a spinner), and a label about one
 * client's button is not a product fact.
 */
import { formatProofTypeList, normaliseProofRequirements, type ProofType } from './proofs'
import type { ProofParams } from './proof-params'
import type { ProofPayload } from './proof-payloads'

export const PROOF_COPY = {
  /** The poster's declared requirement. */
  required: (types: readonly ProofType[]) => `Required proof: ${formatProofTypeList(types)}`,
  /** What is still outstanding, once something has been attached. */
  stillNeeded: (types: readonly ProofType[]) => `Still needed: ${formatProofTypeList(types)}`,
  /** Every declared type is covered. */
  allCovered: 'All required proof attached',
  /**
   * Shown BEFORE anything is attached — the pre-accept case, where the worker
   * is being told what accepting will commit them to rather than what is
   * missing from an upload they have started.
   */
  attachBeforeSubmit: "You'll need to attach this before you can submit the work.",
  /**
   * What the escrow ALREADY holds, on the retry screen. Without it the retry
   * is an empty form with an enabled button, and the worker has no way to know
   * the files they uploaded a minute ago survived the failed transaction.
   *
   * Takes the stored proof ROWS, which repeat by type — three photos is an
   * ordinary batch. So the types are deduplicated (through the shared
   * normaliser, which also fixes their order) and the COUNT carries the rest;
   * listing per row read "Photo, Photo, Photo". The plural follows the row
   * count, not the type count, for the same reason. "Proofs", not "files" —
   * a stored geotag check-in or written answer was never a file.
   */
  alreadyAttached: (types: readonly ProofType[]) => {
    const one = types.length === 1
    return (
      `Already attached to this escrow: ${types.length} ${one ? 'proof' : 'proofs'} ` +
      `(${formatProofTypeList(normaliseProofRequirements(types))}). ` +
      `Submitting again reuses ${one ? 'it' : 'them'} — you only need to add ` +
      `something new if you want to extend the evidence.`
    )
  },
  /** A worker's captured check-in point, as the capture UI echoes it. */
  checkedInAt: (latitude: number, longitude: number) =>
    `Checked in at ${formatCoords(latitude, longitude)}`,
  /**
   * The persist leg failed with no server message to relay. "Proof", not
   * "files": the batch may be a check-in or a written answer that was never
   * a file, and both clients toast this same fallback.
   */
  saveFailed: 'Failed to save proof',
} as const

/** Metres for display, thousands-grouped: `1,500 m`. */
export function formatMetres(metres: number): string {
  return `${metres.toLocaleString('en-US')} m`
}

/**
 * The pre-submit verdict on a captured check-in against the gig's declared
 * radius — what the SERVER will do with it, said before the wallet opens.
 * Shared so both capture UIs judge and word it identically; advisory, the
 * server re-verifies.
 */
export function checkInVerdict(
  distanceM: number,
  radiusM: number,
): { outOfRange: boolean; text: string } {
  const outOfRange = distanceM > radiusM
  return {
    outOfRange,
    text: outOfRange
      ? `${formatMetres(distanceM)} from the gig's point, outside the ${formatMetres(radiusM)} allowed. It will be refused from here.`
      : `within range (${formatMetres(distanceM)} of ${formatMetres(radiusM)}).`,
  }
}

/**
 * The bar a param-bearing requirement sets, as one sentence for the detail
 * surfaces — what accepting commits a worker to, next to the requirement
 * itself. Null for types that take no params (and when the gig declared
 * none, which pre-#14 rows legally do).
 */
export function proofParamDetail(type: ProofType, params: ProofParams | null): string | null {
  if (type === 'geotag' && params?.geotag !== undefined) {
    return `Check in within ${formatMetres(params.geotag.radius_m)} of the gig's location`
  }
  if (type === 'structured' && params?.structured !== undefined) {
    const fields = params.structured.fields.map((field) =>
      field.required ? field.name : `${field.name} (optional)`,
    )
    return `Report: ${fields.join(', ')}`
  }
  return null
}

/**
 * The one way this product prints a coordinate pair — ~1 m of precision;
 * whatever the device reported stays stored untouched. Used for geotag
 * payloads and for the composer's captured check-in pin alike.
 */
export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

/** One rendered line of a data-proof payload; label only where one exists. */
export interface ProofPayloadLine {
  label: string | null
  value: string
}

/**
 * A stored data-proof payload as display lines, shared by every surface that
 * shows evidence (mobile detail, web party panel/dossier, admin gallery) so
 * one payload reads identically everywhere. Discriminates on the payload's
 * own shape — the union's members share no keys.
 */
export function proofPayloadLines(payload: ProofPayload): ProofPayloadLine[] {
  if ('text' in payload) return [{ label: null, value: payload.text }]
  if ('values' in payload) {
    return Object.entries(payload.values).map(([label, value]) => ({
      label,
      value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value),
    }))
  }
  return [{ label: null, value: formatCoords(payload.latitude, payload.longitude) }]
}

/**
 * The requirement and its status as ONE paragraph, for a surface that renders
 * them together rather than as separate lines. The punctuation lives here
 * rather than in a client's markup, so joining them cannot become the place
 * the two clients diverge again.
 */
export function proofRequirementLine(
  required: readonly ProofType[],
  missing: readonly ProofType[],
): string {
  const status = missing.length > 0 ? PROOF_COPY.stillNeeded(missing) : PROOF_COPY.allCovered
  return `${PROOF_COPY.required(required)}. ${status}.`
}
