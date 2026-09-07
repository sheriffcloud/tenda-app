/**
 * The folder's public surface: what GigCTABar needs to build a bar, plus the
 * one helper the gig screen itself uses.
 *
 * Deliberately NOT everything the folder exports. The rules, the slot maps and
 * the arrangement type stay internal — the tests reach them through their own
 * modules, which is where they belong, and re-exporting them here would invite
 * a caller to reimplement the bar rather than render it.
 */
export { ApprovalCTA, type ApprovalAction } from './ApprovalCTA'
export { LifecycleCTA } from './LifecycleCTA'
export { gigCtaBranches, type CtaBranch } from './branches'
export { assignSlots, isEmptyArrangement } from './slots'
export { approvalContextOf, partiesOf } from './parties'
export type { ActiveSheet } from './types'
export type { CtaWidth } from './slots'
