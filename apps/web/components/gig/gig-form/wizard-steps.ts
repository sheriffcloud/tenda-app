/**
 * The Post Wizard's five steps (comp: "Tenda Post Wizard").
 *
 * This is a REGROUPING of the fields mobile's three-step composer already
 * collects — not a second definition of what a valid gig is. Every step's
 * requirement is composed from the shared per-field checks, so a threshold
 * can never drift between the two clients.
 *
 * Three rules the comp proposes are deliberately NOT adopted:
 *   • title of at least 12 characters
 *   • description of at least 30
 *   • at least one proof type
 * Shared's gig-composer contract states that what a valid gig is cannot fork
 * between clients, and `proofRequirements: []` is documented there as a valid
 * value meaning "any evidence accepted". Enforcing these on web alone would
 * reject gigs mobile accepts. If we want them, they belong in shared and
 * apply to both.
 */
import {
  GIG_REQUIREMENTS,
  firstMissingRequirement,
  type GigRequirementCheck,
  type GigValidationValues,
} from '@tenda/shared'

export interface WizardStep {
  key: WizardStepKey
  /** Rail entry. */
  label: string
  /** Rail sub-line — what the step is FOR, in three or four words. */
  hint: string
  /** Panel heading. */
  title: string
  blurb: string
  requirements: readonly GigRequirementCheck[]
}

export type WizardStepKey = 'category' | 'brief' | 'where' | 'proof' | 'money'

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    key: 'category',
    label: 'Category',
    hint: 'Where it files',
    title: 'What kind of work is this?',
    blurb:
      'The category decides how people find it and which filters it appears under. It is taxonomy, not decoration.',
    requirements: [GIG_REQUIREMENTS.category],
  },
  {
    key: 'brief',
    label: 'The brief',
    hint: 'What and how',
    title: 'Write the brief',
    blurb:
      'One decision here: say the work plainly enough that a stranger could do it without asking you anything.',
    requirements: [GIG_REQUIREMENTS.title, GIG_REQUIREMENTS.description],
  },
  {
    key: 'where',
    label: 'Where and when',
    hint: 'Place and clocks',
    title: 'Where and by when?',
    blurb:
      'The accept deadline governs the escrow. If nobody takes it by then, the funds come back to you.',
    requirements: [GIG_REQUIREMENTS.place, GIG_REQUIREMENTS.duration],
  },
  {
    key: 'proof',
    label: 'Proof and taking',
    hint: 'What settles it',
    title: 'What proof settles it?',
    blurb:
      'Proof is what turns finished work into released money. Pick what you would genuinely check.',
    // An empty selection stays valid ("any evidence") — but a param-bearing
    // requirement (geotag, structured) blocks until its params are complete.
    requirements: [GIG_REQUIREMENTS.proof],
  },
  {
    key: 'money',
    label: 'Amount and signing',
    hint: 'Fund the escrow',
    title: 'Fund the escrow',
    // NOT the comp's wording. The comp says the fee is "added on top and taken
    // now", which is not what this contract does: the poster locks the budget
    // and the platform fee comes out of the WORKER's payout at settlement
    // (see FeeSummary / useEscrowFee). Promising the other model here would
    // misstate what the signature about to be collected actually does.
    blurb:
      'You lock the budget now. The platform fee comes out of the worker’s payout when the gig completes, so what you escrow is exactly the figure below.',
    requirements: [GIG_REQUIREMENTS.budget],
  },
]

/** `Step 3 of 5` — the counter above each panel heading. */
export function stepCounter(index: number): string {
  return `Step ${index + 1} of ${WIZARD_STEPS.length}`
}

/** What this step still needs, or null when the reader may move on. */
export function wizardStepMissingRequirement(
  index: number,
  values: GigValidationValues,
): string | null {
  const step = WIZARD_STEPS[index]
  if (step === undefined) return null
  return firstMissingRequirement(step.requirements, values)
}

/**
 * Rail state for one entry, following the comp:
 *   • a step BEFORE the current one is `done` when it is actually satisfied —
 *     walking back and emptying the title must un-tick it, not leave a green
 *     check over a step that no longer passes
 *   • a step AFTER the current one is locked until the current one is met
 */
export function wizardRailState(
  index: number,
  currentIndex: number,
  values: GigValidationValues,
): { current: boolean; done: boolean; locked: boolean } {
  const satisfied = wizardStepMissingRequirement(index, values) === null
  const currentSatisfied = wizardStepMissingRequirement(currentIndex, values) === null
  return {
    current: index === currentIndex,
    done: index < currentIndex && satisfied,
    locked: index > currentIndex && !currentSatisfied,
  }
}

/**
 * The first step still holding an unmet requirement, or null when every step
 * is satisfied.
 *
 * The last step is judged on the WHOLE form, so it can be blocked by a field
 * that lives on an earlier one — the completion window, for instance, is
 * collected on "Where and when". Without this the reader would be told to
 * "Set a delivery time" while standing on a step that has no such field, with
 * nothing pointing at where it actually is.
 */
export function firstUnsatisfiedStep(values: GigValidationValues): number | null {
  const index = WIZARD_STEPS.findIndex(
    (_, i) => wizardStepMissingRequirement(i, values) !== null,
  )
  return index === -1 ? null : index
}
