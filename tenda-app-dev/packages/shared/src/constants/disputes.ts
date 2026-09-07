/**
 * Filter vocabularies for the admin dispute queue (GET /v1/admin/disputes).
 *
 * Shared because BOTH ends need them and disagreement is silent: the server
 * rejects anything outside these lists with a 400, so a dashboard holding its
 * own copy would ship a filter the API refuses. `kind` is deliberately absent
 * — it narrows against `escrowKindEnum.enumValues`, the same enum `EscrowKind`
 * itself derives from, rather than gaining a third hand-written copy.
 */

/** Triage views. Absent (or empty) means unfiltered, not invalid. */
export const DISPUTE_LIST_STATUSES = ['open', 'resolved'] as const
export type DisputeListStatus = (typeof DISPUTE_LIST_STATUSES)[number]

/** Claim-pool views: my caseload vs the unclaimed pool. */
export const DISPUTE_LIST_ASSIGNED = ['me', 'none'] as const
export type DisputeListAssigned = (typeof DISPUTE_LIST_ASSIGNED)[number]
