/**
 * "What you are publishing" — the last chance to catch a wrong answer before
 * the wallet opens.
 *
 * Pure, and deliberately separate from the panel that renders it: every label
 * here comes from the SHARED vocabulary (category labels, proof list, accept
 * deadline options, duration formatting) so the review cannot describe the
 * gig in words the rest of the product does not use.
 *
 * Money is NOT in this list. The amount and the fee belong to the fee
 * projection above it, which has one source (useEscrowFee) — restating a
 * figure here would be a second place for it to be wrong.
 */
import {
  ACCEPT_DEADLINE_OPTIONS,
  CATEGORY_LABELS,
  formatDuration,
  formatProofTypeList,
  type GigCategory,
  type ProofType,
} from '@tenda/shared'

export interface ReviewRow {
  label: string
  value: string
}

export interface ReviewInput {
  category: GigCategory | null
  remote: boolean
  country: string | null
  city: string | null
  acceptDeadlineHours: number
  completionDuration: number
  proofRequirements: readonly ProofType[]
  requiresApproval: boolean
  networkLabel: string
}

/** Where the work happens, as the feed will show it. */
export function reviewPlace(input: Pick<ReviewInput, 'remote' | 'country' | 'city'>): string {
  if (input.remote) return 'Remote'
  const parts = [input.city, input.country].filter((p): p is string => p !== null && p !== '')
  return parts.length > 0 ? parts.join(', ') : 'Not set'
}

/**
 * The accept deadline in the same words the picker offered. An hour count with
 * no matching option is shown as hours rather than silently mapped to the
 * nearest label — the reader must see what they actually chose.
 */
export function reviewAcceptDeadline(hours: number): string {
  return ACCEPT_DEADLINE_OPTIONS.find((o) => o.hours === hours)?.label ?? `${hours}h`
}

export function buildReviewRows(input: ReviewInput): ReviewRow[] {
  return [
    {
      label: 'Category',
      value: input.category !== null ? CATEGORY_LABELS[input.category] : 'Not set',
    },
    { label: 'Where', value: reviewPlace(input) },
    { label: 'Accept by', value: reviewAcceptDeadline(input.acceptDeadlineHours) },
    { label: 'Time to complete', value: formatDuration(input.completionDuration) },
    {
      label: 'Proof',
      // An empty requirement list is a real choice, not an unanswered
      // question: it means the worker may settle with any evidence.
      value:
        input.proofRequirements.length > 0
          ? formatProofTypeList(input.proofRequirements)
          : 'Any evidence',
    },
    {
      label: 'Who can take it',
      value: input.requiresApproval ? 'You approve an applicant' : 'First qualified worker',
    },
    { label: 'Settles on', value: input.networkLabel },
  ]
}
