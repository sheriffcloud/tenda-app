/**
 * Branches → the arrangement the bar renders.
 *
 * Separate from both the rules and the rendering because it answers the one
 * question neither does: given everything a viewer may do, what does the bar
 * look like? Keeping it pure means the whole arrangement — including that no
 * row is ever crowded — is assertable without rendering anything.
 */

import { MAX_SECONDARY, SLOT_ORDER, type CtaSlot } from './types'
import type { CtaBranch } from './branches'

/**
 * Left-to-right order of the secondary row.
 *
 * Declared rather than left to push order, so the row does not reshuffle when
 * an unrelated rule changes. Constructive actions first, the destructive or
 * last-resort ones last — Dispute is always rightmost because it is never the
 * move you want someone reaching for by accident.
 *
 * MUST list exactly the ids slotted `secondary`, in both directions, and
 * `slots.test.ts` asserts it against the slot maps. Hand-keeping this list is
 * the one drift vector left in the folder: an unlisted branch would rank -1
 * and silently jump to the FRONT of the row, ahead of Dispute.
 */
export const SECONDARY_ORDER: readonly CtaBranch['id'][] = [
  'addProof',
  'addEvidence',
  'reclaim',
  'release',
  'decline',
  'deleteDraft',
  'cancel',
  'dispute',
]

/** Unlisted ranks LAST, so a missed entry degrades quietly instead of leaping
 *  to the front — the test above is what actually catches it. */
function secondaryRank(branch: CtaBranch): number {
  const i = SECONDARY_ORDER.indexOf(branch.id)
  return i === -1 ? SECONDARY_ORDER.length : i
}

export interface CtaArrangement {
  notice: CtaBranch | null
  primary: CtaBranch | null
  secondary: CtaBranch[]
  /**
   * Branches that lost a single-occupancy slot, or overflowed the secondary
   * row. Always empty for every state the app can reach — the matrix test
   * asserts exactly that, which is what makes adding a branch safe: a new one
   * that would bury or crowd an existing button fails there instead of
   * shipping. Resolution in production stays deterministic (first wins) rather
   * than throwing, because a crowded bar is a bad screen, not a crash.
   */
  conflicts: CtaBranch[]
}

export function assignSlots(branches: CtaBranch[]): CtaArrangement {
  const arrangement: CtaArrangement = {
    notice: null,
    primary: null,
    secondary: [],
    conflicts: [],
  }

  for (const slot of SLOT_ORDER) {
    for (const branch of branches.filter((b) => b.slot === slot)) {
      if (place(arrangement, slot, branch)) continue
      arrangement.conflicts.push(branch)
    }
  }

  arrangement.secondary.sort((a, b) => secondaryRank(a) - secondaryRank(b))
  return arrangement
}

/** Seats one branch, or reports that its slot is already full. */
function place(arrangement: CtaArrangement, slot: CtaSlot, branch: CtaBranch): boolean {
  if (slot === 'secondary') {
    if (arrangement.secondary.length >= MAX_SECONDARY) return false
    arrangement.secondary.push(branch)
    return true
  }
  if (arrangement[slot] !== null) return false
  arrangement[slot] = branch
  return true
}

/** Nothing to draw — the bar hides rather than rendering an empty container. */
export function isEmptyArrangement(a: CtaArrangement): boolean {
  return a.notice === null && a.primary === null && a.secondary.length === 0
}

/**
 * How wide a control renders, which the ARRANGEMENT decides — not the branch.
 *
 * Three, not a boolean, because the original bar weighted its two-button rows:
 * the constructive action flexed and the danger one sized to its label, so
 * "Dispute" never took half the row. A single in-a-row boolean flattens that
 * to 50/50, which is a real design change dressed up as a refactor.
 *
 *  - `full` — alone on its row.
 *  - `grow` — first of a pair, takes the remaining width.
 *  - `auto` — beside a `grow`, sized to its own label.
 */
export type CtaWidth = 'full' | 'grow' | 'auto'
