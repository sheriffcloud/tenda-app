/**
 * The gig composer's cross-client contract: form value shape, field limits,
 * per-category hints, step metadata and the step/whole-form validation both
 * clients run (moved from apps/mobile/components/gig/gig-form/{constants,
 * gig-composer.steps}.ts 2026-08-15). Pure — the React form controllers stay
 * per-client, but what a VALID gig is can never fork between them.
 */
import type { GigCategory } from './categories'
import type { ProofType } from './proofs'
import type { ProofParams } from './proof-params'
import { proofSetupProblem, type ProofParamsDraft } from './gig-composer-proofs'
import { isValidGigAmountRaw } from '../utils/validation'
import { completionDurationProblem } from '../utils/gig-duration'
import { gigBudgetRangeLabel } from '../utils/gig-budget'

export const TITLE_MAX = 80
export const DESC_MAX = 1500

/**
 * Completion window a gig starts with — the form's initial value and the
 * fallback when a draft has none. Both readers share it so the two can't drift.
 */
export const DEFAULT_COMPLETION_SECONDS = 86_400

export const CATEGORY_HINTS: Record<GigCategory, string> = {
  delivery: 'Pickup address, drop-off, package size, fragility notes.',
  photo:    'Type of shoot (product/event/portrait), duration, edits expected.',
  errand:   'What needs doing, where, and any items + budget to purchase.',
  service:  'Type of service, tools/materials, accessibility requirements.',
  digital:  'Scope, deliverable format, revision rounds, tools/accounts.',
}

/** Appended to every description hint — proof is required to complete any gig. */
export const PROOF_NOTE = 'Proof required before the gig can be considered completed.'

// ---------- the wallet precondition (#59) ---------------------------------
//
// Posting needs a wallet, and the composer used to let that surface only at
// the signature — as a redirect that took the filled form with it. This copy
// is said UP FRONT instead, and it is deliberately not phrased as a refusal:
// nothing here blocks composing, so the notice explains and offers a way to
// fix it rather than standing in the way.

export const COMPOSER_WALLET_TITLE = 'Posting needs a linked wallet'
/** Says what the wallet is FOR, so it reads as a reason and not a hoop. */
export const COMPOSER_WALLET_BODY =
  'The wallet you link signs the escrow that locks your budget, and it is where the refund goes if nobody takes the gig. Fill this in now if you like; you will need one to post.'
export const COMPOSER_WALLET_CTA = 'Link a wallet'

/**
 * The wallets[] load FAILED. Distinct copy on purpose: "you have no wallet"
 * is a claim about the user, and we have not earned it — all we know is that
 * we could not look.
 */
export const COMPOSER_WALLET_UNAVAILABLE_TITLE = 'Could not check your wallets'
export const COMPOSER_WALLET_UNAVAILABLE_BODY =
  'We could not read your linked wallets just now. Posting needs one, so try again before you sign.'
export const COMPOSER_WALLET_RETRY = 'Try again'

export interface GigFormValues {
  title: string
  description: string
  /** CAIP-2 chain + its gig asset (CO5), always a gigAssetByChain pair. */
  chainId: string
  asset: string
  /**
   * Budget in raw units of `asset`, as a canonical base-unit STRING.
   *
   * Not a number: one token of an 18-decimal asset is 1e18 base units, past
   * the 2^53 where a JS number stops being exact, so `number` cannot hold the
   * value it claims to. '' means "not set yet" — the composer starts empty and
   * `budget` below is what refuses it.
   */
  paymentRaw: string
  completionDuration: number
  category: GigCategory | null
  country: string | null
  remote: boolean
  city: string | null
  acceptDeadlineHours: number
  /** Empty = any evidence accepted (the pre-existing behaviour). */
  proofRequirements: ProofType[]
  /**
   * Where a geotag check-in is verified against. Only non-null when a geotag
   * proof is required (composerProofSubmission derives all three fields from
   * the editor draft) — the pin has no other consumer today.
   */
  latitude: number | null
  longitude: number | null
  /** Params for the param-bearing requirements; null when none is selected. */
  proofParams: ProofParams | null
  /**
   * Approval mode: the poster assigns from applications instead of the gig
   * being first-come. Baked on-chain at create and never editable afterwards,
   * which is why it belongs on the create form and nowhere else.
   */
  requiresApproval: boolean
}

export const GIG_COMPOSER_STEPS = [
  { key: 'details', label: 'Details', title: 'Describe the work', subtitle: 'Help the right person understand the job at a glance.' },
  { key: 'payment', label: 'Payment', title: 'Set payment and timing', subtitle: 'Choose a budget, network, and realistic delivery window.' },
  { key: 'delivery', label: 'Delivery', title: 'Define delivery', subtitle: 'Decide who can take the gig and what proof you expect.' },
] as const

export type GigComposerStep = (typeof GIG_COMPOSER_STEPS)[number]['key']

export interface GigValidationValues {
  title: string
  description: string
  category: GigCategory | null
  remote: boolean
  country: string | null
  city: string | null
  asset: string
  /** Base-unit string; see GigFormValues.paymentRaw. */
  paymentRaw: string
  completionDuration: number
  proofRequirements: ProofType[]
  /** The proof-param editors' live state — see gig-composer-proofs. */
  proofDraft: ProofParamsDraft
}

/** What one field still needs, phrased as the action the poster must take. */
export type GigRequirementCheck = (values: GigValidationValues) => string | null

/**
 * The requirements, one per FIELD rather than per step.
 *
 * Clients group these differently — mobile collects them in three steps, the
 * web wizard in five — but the rule for any single field is defined once,
 * here. A client that restated a threshold locally would be redefining what a
 * valid gig is, which this module exists to prevent.
 */
export const GIG_REQUIREMENTS = {
  category: (v) => (v.category === null ? 'Pick a category' : null),
  title: (v) => (v.title.trim().length === 0 ? 'Add a title' : null),
  description: (v) => (v.description.trim().length === 0 ? 'Add a description' : null),
  /**
   * Remote gigs carry no location at all, so neither field is required; a
   * physical gig needs both, and the country is asked for first because the
   * city list depends on it.
   */
  place: (v) => {
    if (v.remote) return null
    if (v.country === null) return 'Select a country'
    if (v.city === null) return 'Select a city'
    return null
  },
  /**
   * Two different problems, because they need two different answers: an empty
   * field is a step not finished, while a number outside the rail is a number
   * the reader chose and needs telling about. Both used to say 'Set a budget',
   * which is a lie in front of a field that visibly has a budget in it.
   */
  budget: (v) => {
    if (v.paymentRaw === '') return 'Set a budget'
    if (!isValidGigAmountRaw(v.asset, v.paymentRaw)) {
      return `Budget must be ${gigBudgetRangeLabel(v.asset)}`
    }
    return null
  },
  // Says WHICH way it is wrong. This answered 'Set a delivery time' for both
  // "none yet" and "91 days", so a reader who had just typed a window was told
  // to enter one — the same undifferentiated message the budget rule carried
  // before #32, fixed the same way.
  duration: (v) => completionDurationProblem(v.completionDuration),
  /**
   * The proof step. Only the param-bearing requirements can be "missing" —
   * an empty requirement list stays a valid gig — so the whole rule lives in
   * proofSetupProblem beside the editor contract it validates.
   */
  proof: (v) => proofSetupProblem(v.proofRequirements, v.remote, v.proofDraft),
} satisfies Record<string, GigRequirementCheck>

/** The first requirement not yet met, in the order the reader meets them. */
export function firstMissingRequirement(
  checks: readonly GigRequirementCheck[],
  values: GigValidationValues,
): string | null {
  for (const check of checks) {
    const missing = check(values)
    if (missing !== null) return missing
  }
  return null
}

const STEP_REQUIREMENTS: Record<GigComposerStep, readonly GigRequirementCheck[]> = {
  details: [
    GIG_REQUIREMENTS.category,
    GIG_REQUIREMENTS.title,
    GIG_REQUIREMENTS.description,
    GIG_REQUIREMENTS.place,
  ],
  payment: [GIG_REQUIREMENTS.budget, GIG_REQUIREMENTS.duration],
  // An empty proofRequirements stays valid ("any evidence"), and instant
  // acceptance is the default — but a PARAM-BEARING requirement (geotag,
  // structured) is only publishable once its params are complete.
  delivery: [GIG_REQUIREMENTS.proof],
}

export function getGigStepMissingRequirement(
  step: GigComposerStep,
  values: GigValidationValues,
): string | null {
  return firstMissingRequirement(STEP_REQUIREMENTS[step], values)
}

export function getGigMissingRequirement(values: GigValidationValues): string | null {
  for (const step of GIG_COMPOSER_STEPS) {
    const missing = getGigStepMissingRequirement(step.key, values)
    if (missing !== null) return missing
  }
  return null
}
