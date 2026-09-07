/**
 * Worker capacity — how many gigs one person may hold at once.
 *
 * Pure half: the boundary decision and the message. The SQL that decides
 * WHICH escrows consume a slot lives in `store.ts`; the wiring lives in
 * `guards.ts`. Split the same way as features/reputation so the interesting
 * logic is testable without a database.
 *
 * Why a cap at all: accepting is a commitment backed by someone else's locked
 * funds. Before this, one worker could accept unlimited gigs and the only
 * consequence was retrospective — `RESTRICTION_TIERS` issues an accept
 * cooldown after three abandonments, i.e. after three posters were burned.
 */

export interface CapacityCheck {
  allowed: boolean
  /** Live gigs the worker currently holds. */
  active: number
  /** Configured ceiling (`platform_config.max_pending_gigs`). */
  limit: number
  /** Slots left; never negative, so it is safe to show to a user. */
  remaining: number
}

/**
 * `active < limit` — a worker at exactly the limit is blocked.
 *
 * `active` can legitimately EXCEED `limit` (an operator lowered the cap, or
 * an accept landed straight on-chain and bypassed this guard), which is why
 * `remaining` is clamped rather than subtracted raw.
 */
export function checkGigCapacity(active: number, limit: number): CapacityCheck {
  return {
    allowed: active < limit,
    active,
    limit,
    remaining: Math.max(0, limit - active),
  }
}

/**
 * Refusal copy. States the rule and the way out, because the worker's next
 * question is always "so what do I do now?".
 */
/**
 * Third-person wording for the ASSIGN path, where the caller is the poster and
 * the person at capacity is someone else. Reusing the second-person message
 * there would tell a poster *they* were at capacity, which is both wrong and
 * confusing — the numbers are shared so the two can never disagree.
 */
export function workerCapacityMessage(check: CapacityCheck): string {
  const gigs = check.limit === 1 ? 'gig' : 'gigs'
  return `This worker already has ${check.active} active ${check.active === 1 ? 'gig' : 'gigs'} and the limit is ${check.limit} ${gigs}. Pick someone else, or wait until they finish one.`
}

export function capacityMessage(check: CapacityCheck): string {
  const gigs = check.limit === 1 ? 'gig' : 'gigs'
  return `You can work on ${check.limit} ${gigs} at a time. Finish or submit one of your ${check.active} active gigs before accepting another.`
}
