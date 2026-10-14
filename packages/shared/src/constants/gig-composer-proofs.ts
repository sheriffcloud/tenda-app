/**
 * The composer's half of the proof-params contract (gig-composer's sibling):
 * the in-progress editor state both clients hold while a poster declares
 * geotag/structured requirements, the builder that turns it into the wire's
 * `proof_params` + pin, and the validation both clients run.
 *
 * Pure and shared for the same reason gig-composer is — what a publishable
 * requirement IS cannot fork between clients. The React editors stay
 * per-client; this owns every rule they enforce.
 */
import { normaliseProofRequirements, type ProofType } from './proofs'
import {
  DEFAULT_GEOTAG_RADIUS_M,
  MAX_GEOTAG_RADIUS_M,
  MIN_GEOTAG_RADIUS_M,
  parseProofParams,
  type ProofParams,
  type StructuredFieldKind,
} from './proof-params'

/** One structured field as the poster is typing it — name may be mid-edit. */
export interface StructuredFieldDraft {
  name: string
  kind: StructuredFieldKind
  required: boolean
}

/**
 * Everything the param editors hold. Kept even for types not currently
 * selected, so toggling a requirement off and back on does not wipe what the
 * poster typed — the BUILDER is what scopes output to the selected types.
 */
export interface ProofParamsDraft {
  /** Where a geotag check-in is measured from — captured device coordinates. */
  pin: { latitude: number; longitude: number } | null
  /** Radius as typed; parsed (and refused) by the shared bounds, not the UI. */
  radiusText: string
  fields: StructuredFieldDraft[]
}

export function emptyProofParamsDraft(): ProofParamsDraft {
  return { pin: null, radiusText: String(DEFAULT_GEOTAG_RADIUS_M), fields: [] }
}

/** A draft's starting field row — one editor keystroke away from real. */
export function emptyStructuredFieldDraft(): StructuredFieldDraft {
  return { name: '', kind: 'string', required: true }
}

/**
 * Rebuild the editor state from a stored gig (draft repost). The pin comes
 * from the gig row's own latitude/longitude — proof_params never carries it.
 */
export function draftFromProofParams(
  params: ProofParams | null,
  latitude: number | null,
  longitude: number | null,
): ProofParamsDraft {
  // Built ON the empty draft so the defaults (the seeded radius above all)
  // have exactly one definition — a repost with no stored radius must land on
  // the same value a fresh form does.
  const empty = emptyProofParamsDraft()
  return {
    pin: latitude !== null && longitude !== null ? { latitude, longitude } : empty.pin,
    radiusText: params?.geotag !== undefined ? String(params.geotag.radius_m) : empty.radiusText,
    fields: params?.structured?.fields.map((field) => ({ ...field })) ?? empty.fields,
  }
}

/** The typed radius as the integer the wire wants, or null when unparseable. */
export function draftRadiusM(draft: ProofParamsDraft): number | null {
  const trimmed = draft.radiusText.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

/**
 * The draft's `proof_params` for the SELECTED requirements only — a type the
 * poster deselected contributes nothing, because the server refuses params
 * for a type the gig does not require. Null when no selected type takes
 * params. Field names are trimmed here so validation and the wire see the
 * same value the editor normalises to.
 */
export function buildProofParams(
  requirements: readonly ProofType[],
  draft: ProofParamsDraft,
): ProofParams | null {
  const params: ProofParams = {}
  if (requirements.includes('geotag')) {
    params.geotag = { radius_m: draftRadiusM(draft) ?? Number.NaN }
  }
  if (requirements.includes('structured')) {
    params.structured = {
      fields: draft.fields.map((field) => ({ ...field, name: field.name.trim() })),
    }
  }
  return params.geotag === undefined && params.structured === undefined ? null : params
}

/**
 * Everything POST /v1/gigs needs from the proof editors, in one derivation
 * both clients call from submit: the pin travels only when a geotag proof
 * will be verified against it, and params only for the selected types.
 */
export function composerProofSubmission(
  requirements: readonly ProofType[],
  draft: ProofParamsDraft,
): { latitude: number | null; longitude: number | null; proofParams: ProofParams | null } {
  const needsPin = requirements.includes('geotag')
  return {
    latitude: needsPin ? (draft.pin?.latitude ?? null) : null,
    longitude: needsPin ? (draft.pin?.longitude ?? null) : null,
    proofParams: buildProofParams(requirements, draft),
  }
}

/**
 * What the proof step still needs, phrased as the action the poster must
 * take — the delivery-step twin of the GIG_REQUIREMENTS checks. Null when
 * publishable. The bounds come from the same constants the server enforces;
 * the field-level structured rules are the server's own `parseProofParams`,
 * run here on the built params so the two cannot disagree.
 */
export function proofSetupProblem(
  requirements: readonly ProofType[],
  remote: boolean,
  draft: ProofParamsDraft,
): string | null {
  if (requirements.includes('geotag')) {
    // A remote gig has no place to check in at — the requirement is refused
    // rather than silently dropped, so the poster decides which one to keep.
    if (remote) return 'Location check-in needs a physical gig — turn remote off or unpick it'
    if (draft.pin === null) return 'Set the check-in point for the location proof'
    const radius = draftRadiusM(draft)
    if (radius === null || radius < MIN_GEOTAG_RADIUS_M || radius > MAX_GEOTAG_RADIUS_M) {
      return `Check-in radius must be ${MIN_GEOTAG_RADIUS_M} to ${MAX_GEOTAG_RADIUS_M} metres`
    }
  }
  if (requirements.includes('structured') && draft.fields.length === 0) {
    return 'Add at least one field for the worker to report'
  }
  const parsed = parseProofParams(
    normaliseProofRequirements([...requirements]),
    buildProofParams(requirements, draft),
  )
  // Field-level problems (an empty or duplicate field name, an over-long
  // one) surface in the server's own words — they are already sentences.
  return parsed.error ?? null
}
