import type { GigCategory, ProofType } from '@tenda/shared'

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

// Single-sourced with the exchange offer form (both are escrows).
export { ACCEPT_DEADLINE_OPTIONS } from '@tenda/shared'

export interface GigFormValues {
  title: string
  description: string
  /** CAIP-2 chain + its gig asset (CO5), always a gigAssetByChain pair. */
  chainId: string
  asset: string
  /** Budget in raw units of `asset`. */
  paymentRaw: number
  completionDuration: number
  category: GigCategory | null
  country: string | null
  remote: boolean
  city: string | null
  acceptDeadlineHours: number
  /** Empty = any evidence accepted (the pre-existing behaviour). */
  proofRequirements: ProofType[]
  /**
   * Approval mode: the poster assigns from applications instead of the gig
   * being first-come. Baked on-chain at create and never editable afterwards,
   * which is why it belongs on the create form and nowhere else.
   */
  requiresApproval: boolean
}
