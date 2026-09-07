/**
 * The arrangement layer on its own, including the cases the app cannot
 * currently produce.
 *
 * `matrix.test.ts` asserts that no reachable state has a conflict. This one
 * asserts what happens WHEN one appears — because that is the situation a
 * future branch creates, and "it silently disappeared" is the failure mode the
 * slots exist to prevent.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { assignSlots, isEmptyArrangement, SECONDARY_ORDER } from '../../src/gig-cta/slots'
import { APPROVAL_SLOTS, LIFECYCLE_SLOTS } from '../../src/gig-cta/branches'
import { MAX_SECONDARY } from '../../src/gig-cta/types'
import type { ApprovalBranch, CtaBranch, LifecycleBranch } from '../../src/gig-cta/branches'

// Typed per family rather than cast: `CtaBranch` pairs a family with ITS own
// ids, and a helper taking the union of both had to `as CtaBranch` its way
// past that — which would happily build `{ family: 'lifecycle', id: 'release' }`,
// a branch no renderer can draw.
const primary = (id: LifecycleBranch): CtaBranch => ({ family: 'lifecycle', id, slot: 'primary' })
const secondary = (id: LifecycleBranch): CtaBranch => ({ family: 'lifecycle', id, slot: 'secondary' })
const notice = (id: LifecycleBranch): CtaBranch => ({ family: 'lifecycle', id, slot: 'notice' })
const approvalSecondary = (id: ApprovalBranch): CtaBranch => ({
  family: 'approval',
  id,
  slot: 'secondary',
})

describe('seating', () => {
  it('places one branch per single-occupancy slot', () => {
    const a = assignSlots([primary('submit'), notice('disputedNotice'), secondary('dispute')])
    assert.strictEqual(a.primary?.id, 'submit')
    assert.strictEqual(a.notice?.id, 'disputedNotice')
    assert.deepStrictEqual(a.secondary.map((b) => b.id), ['dispute'])
    assert.deepStrictEqual(a.conflicts, [])
  })

  it('is empty for no branches, and says so', () => {
    const a = assignSlots([])
    assert.strictEqual(isEmptyArrangement(a), true)
    assert.deepStrictEqual(a, { notice: null, primary: null, secondary: [], conflicts: [] })
  })

  it('is NOT empty when only a notice applies', () => {
    // A lost applicant sees nothing but a sentence; the bar must still render.
    assert.strictEqual(isEmptyArrangement(assignSlots([notice('disputedNotice')])), false)
  })
})

describe('ordering', () => {
  it('orders the secondary row by its declared order, not by arrival', () => {
    // Dispute is deliberately last wherever it appears — it is never the move
    // you want someone reaching for by accident.
    const a = assignSlots([secondary('dispute'), secondary('addProof')])
    assert.deepStrictEqual(a.secondary.map((b) => b.id), ['addProof', 'dispute'])
  })

  it('is stable regardless of the order the families were asked in', () => {
    const forwards = assignSlots([approvalSecondary('release'), secondary('dispute')])
    const backwards = assignSlots([secondary('dispute'), approvalSecondary('release')])
    assert.deepStrictEqual(forwards.secondary.map((b) => b.id), backwards.secondary.map((b) => b.id))
  })
})

describe('conflicts', () => {
  it('keeps the first claimant and reports the loser rather than dropping it', () => {
    const a = assignSlots([primary('submit'), primary('approve')])
    assert.strictEqual(a.primary?.id, 'submit')
    assert.deepStrictEqual(a.conflicts.map((b) => b.id), ['approve'])
  })

  it('refuses to crowd the secondary row past the maximum', () => {
    const a = assignSlots([
      secondary('addProof'),
      secondary('dispute'),
      secondary('cancel'),
    ])
    assert.strictEqual(a.secondary.length, MAX_SECONDARY)
    assert.deepStrictEqual(a.conflicts.map((b) => b.id), ['cancel'])
  })

  it('reports a notice collision too — one message, never two', () => {
    const a = assignSlots([notice('disputedNotice'), notice('disputedNotice')])
    assert.strictEqual((a.conflicts).length, 1)
  })
})

/**
 * The one hand-kept list in the folder, pinned to the slot maps.
 *
 * This caught a real drift: `accept` was listed here while slotted `primary`,
 * and `reclaim` was slotted `secondary` while missing — which ranked it -1 and
 * silently put it FIRST in the row, ahead of Dispute.
 */
describe('SECONDARY_ORDER stays in step with the slot maps', () => {
  const declared = [
    ...Object.entries(APPROVAL_SLOTS),
    ...Object.entries(LIFECYCLE_SLOTS),
  ]
    .filter(([, slot]) => slot === 'secondary')
    .map(([id]) => id)
    .sort()

  it('lists every branch slotted secondary', () => {
    assert.deepStrictEqual([...SECONDARY_ORDER].sort(), declared)
  })

  it('lists nothing that is not', () => {
    // Covered by the equality above, stated separately so a failure says which
    // direction drifted.
    for (const id of SECONDARY_ORDER) assert.ok((declared).includes(id))
  })

  it('keeps Dispute rightmost', () => {
    assert.strictEqual(SECONDARY_ORDER[SECONDARY_ORDER.length - 1], 'dispute')
  })
})
