/**
 * The arrangement layer on its own, including the cases the app cannot
 * currently produce.
 *
 * `matrix.test.ts` asserts that no reachable state has a conflict. This one
 * asserts what happens WHEN one appears — because that is the situation a
 * future branch creates, and "it silently disappeared" is the failure mode the
 * slots exist to prevent.
 */
import { assignSlots, isEmptyArrangement, widthProps, SECONDARY_ORDER } from '../slots'
import { APPROVAL_SLOTS, LIFECYCLE_SLOTS } from '../branches'
import { MAX_SECONDARY } from '../types'
import type { ApprovalBranch, CtaBranch, LifecycleBranch } from '../branches'

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
    expect(a.primary?.id).toBe('submit')
    expect(a.notice?.id).toBe('disputedNotice')
    expect(a.secondary.map((b) => b.id)).toEqual(['dispute'])
    expect(a.conflicts).toEqual([])
  })

  it('is empty for no branches, and says so', () => {
    const a = assignSlots([])
    expect(isEmptyArrangement(a)).toBe(true)
    expect(a).toEqual({ notice: null, primary: null, secondary: [], conflicts: [] })
  })

  it('is NOT empty when only a notice applies', () => {
    // A lost applicant sees nothing but a sentence; the bar must still render.
    expect(isEmptyArrangement(assignSlots([notice('disputedNotice')]))).toBe(false)
  })
})

describe('ordering', () => {
  it('orders the secondary row by its declared order, not by arrival', () => {
    // Dispute is deliberately last wherever it appears — it is never the move
    // you want someone reaching for by accident.
    const a = assignSlots([secondary('dispute'), secondary('addProof')])
    expect(a.secondary.map((b) => b.id)).toEqual(['addProof', 'dispute'])
  })

  it('is stable regardless of the order the families were asked in', () => {
    const forwards = assignSlots([approvalSecondary('release'), secondary('dispute')])
    const backwards = assignSlots([secondary('dispute'), approvalSecondary('release')])
    expect(forwards.secondary.map((b) => b.id)).toEqual(backwards.secondary.map((b) => b.id))
  })
})

describe('conflicts', () => {
  it('keeps the first claimant and reports the loser rather than dropping it', () => {
    const a = assignSlots([primary('submit'), primary('approve')])
    expect(a.primary?.id).toBe('submit')
    expect(a.conflicts.map((b) => b.id)).toEqual(['approve'])
  })

  it('refuses to crowd the secondary row past the maximum', () => {
    const a = assignSlots([
      secondary('addProof'),
      secondary('dispute'),
      secondary('cancel'),
    ])
    expect(a.secondary).toHaveLength(MAX_SECONDARY)
    expect(a.conflicts.map((b) => b.id)).toEqual(['cancel'])
  })

  it('reports a notice collision too — one message, never two', () => {
    const a = assignSlots([notice('disputedNotice'), notice('disputedNotice')])
    expect(a.conflicts).toHaveLength(1)
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
    expect([...SECONDARY_ORDER].sort()).toEqual(declared)
  })

  it('lists nothing that is not', () => {
    // Covered by the equality above, stated separately so a failure says which
    // direction drifted.
    for (const id of SECONDARY_ORDER) expect(declared).toContain(id)
  })

  it('keeps Dispute rightmost', () => {
    expect(SECONDARY_ORDER[SECONDARY_ORDER.length - 1]).toBe('dispute')
  })
})

/**
 * The row weighting the bar has always had, which a single in-a-row boolean
 * flattens to 50/50 — giving "Dispute" half the row beside "Add More Proof".
 * The widths are the ARRANGEMENT's call, so they are pinned here rather than
 * left to whichever renderer happens to be looking.
 */
describe('widthProps', () => {
  it('fills the row when alone', () => {
    expect(widthProps('full')).toEqual({ size: 'xl', fullWidth: true })
  })

  it('grows the leading button and lets the trailing one size to its label', () => {
    expect(widthProps('grow')).toEqual({ size: 'xl', style: { flex: 1 } })
    expect(widthProps('auto')).toEqual({ size: 'xl' })
  })

  it('never sets fullWidth and flex together — they fight', () => {
    for (const w of ['full', 'grow', 'auto'] as const) {
      const p = widthProps(w)
      expect(p.fullWidth === true && p.style !== undefined).toBe(false)
    }
  })
})
