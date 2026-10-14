/**
 * Escrow lifecycle as a SHAPE: a linear spine with a terminal branch.
 *
 * `ESCROW_STATUS_ORDER` deliberately warns against rendering itself as a
 * timeline — it interleaves one progressive path with four states that branch
 * off wherever the escrow happened to be, so drawing it in order implies
 * disputes follow completion. This module is the shape that comment asks for,
 * and it lives in shared because "which statuses are progress and which are a
 * branch" is domain truth, not a web layout detail.
 *
 * NOT the same thing as ESCROW_STATUS_SETTLEMENT, which classifies whether the
 * contract still holds value: `disputed` is unsettled AND a branch, `completed`
 * is settled AND the end of the spine. Conflating them would put a dispute on
 * the happy path.
 */
import { ESCROW_STATUS_ORDER, type EscrowStatusName } from '../../constants/escrow'

/** The progressive path a healthy escrow walks, in order. */
export const ESCROW_SPINE = ['open', 'accepted', 'submitted', 'completed'] as const

export type EscrowSpineStatus = (typeof ESCROW_SPINE)[number]

export function isSpineStatus(status: string): status is EscrowSpineStatus {
  return (ESCROW_SPINE as readonly string[]).includes(status)
}

/**
 * States that branch off the spine. Derived from the canonical order so a new
 * status cannot be silently omitted from both lists.
 */
export const ESCROW_BRANCH_STATUSES = ESCROW_STATUS_ORDER.filter((s) => !isSpineStatus(s))

export type EscrowTimelineNodeState = 'done' | 'current' | 'upcoming'

export interface EscrowTimelineNode {
  status: EscrowSpineStatus
  state: EscrowTimelineNodeState
  /** ISO timestamp when the wire carries one for this step, else null. */
  stamp: string | null
}

export interface EscrowTimeline {
  spine: EscrowTimelineNode[]
  /** The terminal state the escrow branched to, or null while on the spine. */
  branch: EscrowStatusName | null
}

/**
 * What the wire actually carries.
 *
 * The comps' timeline reads `accepted_at` and `completed_at`; neither exists
 * on the wire OR in the schema (see spec-correction #9). Progress therefore
 * comes from `status`, which IS authoritative, and timestamps are used only
 * for the two steps that really have one.
 */
export interface EscrowTimelineInput {
  status: EscrowStatusName | 'draft'
  created_at?: string | null
  submitted_at?: string | null
}

/**
 * Truthy, not `!= null`: an empty string is off-contract but cheap to survive,
 * and the alternative is claiming an escrow reached a step it never did.
 */
const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value !== ''

function stampFor(status: EscrowSpineStatus, input: EscrowTimelineInput): string | null {
  if (status === 'open') return present(input.created_at) ? input.created_at : null
  if (status === 'submitted') return present(input.submitted_at) ? input.submitted_at : null
  // accepted/completed have no timestamp on the wire — say nothing rather
  // than invent one.
  return null
}

export function buildEscrowTimeline(input: EscrowTimelineInput): EscrowTimeline {
  const branch: EscrowStatusName | null = isSpineStatus(input.status)
    ? null
    : input.status === 'draft'
      ? null
      : input.status

  // A draft was never funded, so it has walked none of the spine.
  const isDraft = input.status === 'draft'

  const spineIndex = isSpineStatus(input.status) ? ESCROW_SPINE.indexOf(input.status) : -1

  /**
   * How far a BRANCHED escrow provably got. A cancellation can happen from
   * anywhere and the wire does not say from where, so only claim what is
   * evidenced: it existed on-chain (open), and if it was submitted then it
   * must also have been accepted.
   */
  const provenReach = present(input.submitted_at) ? ESCROW_SPINE.indexOf('submitted') : 0

  const spine = ESCROW_SPINE.map((status, index): EscrowTimelineNode => {
    let state: EscrowTimelineNodeState
    if (isDraft) {
      state = 'upcoming'
    } else if (branch !== null) {
      // Nothing on the spine is "current" — the branch is where it stopped.
      state = index <= provenReach ? 'done' : 'upcoming'
    } else if (index < spineIndex) {
      state = 'done'
    } else if (index === spineIndex) {
      state = 'current'
    } else {
      state = 'upcoming'
    }
    return { status, state, stamp: stampFor(status, input) }
  })

  return { spine, branch }
}
