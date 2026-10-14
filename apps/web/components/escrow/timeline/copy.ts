import type { EscrowSpineStatus, EscrowStatus, EscrowTimelineNodeState } from '@tenda/shared'

/**
 * Timeline copy. Labels themselves come from shared STATUS_LABEL — only the
 * explanatory bodies live here, because they describe what the step means on
 * THIS surface rather than what the status is called.
 */
export const STATE_TIMELINE_COPY = {
  heading: 'Record',

  /** Spoken state, so the dot's colour is not the only signal. */
  state: {
    done: 'done',
    current: 'in progress',
    upcoming: 'not yet',
  } satisfies Record<EscrowTimelineNodeState, string>,

  body: {
    open: 'Funds are locked on-chain and the gig is open to be taken.',
    accepted: 'Someone has taken the gig and the clock is running.',
    submitted: 'Work was submitted and is waiting to be approved.',
    completed: 'Approved and released to the worker.',
  } satisfies Record<EscrowSpineStatus, string>,
} as const

const BRANCH_BODY: Partial<Record<EscrowStatus, string>> = {
  cancelled: 'This escrow was cancelled before it completed. Nothing was released.',
  refunded: 'The amount went back to whoever funded it — including when a deadline passed.',
  disputed: 'A dispute is open. A mediator decides where the funds go.',
  resolved: 'A mediator settled the dispute and the funds were distributed.',
}

/**
 * Why the escrow left the happy path. Falls back rather than throwing: a
 * status added to shared before this copy exists should degrade to a plain
 * statement, not a crash on a page someone is trying to read.
 */
export function timelineBranchCopy(status: EscrowStatus): string {
  return BRANCH_BODY[status] ?? 'This escrow left the usual path.'
}
