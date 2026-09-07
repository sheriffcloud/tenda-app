/**
 * The gig CTA rules + arrangement layer (moved from
 * apps/mobile/components/gig/gig-cta 2026-08-15): which controls a viewer
 * sees on a gig, per (status × mode × viewer × timing). Pure over GigDetail
 * and the shared can* helpers — the renderers (button components, width→
 * style mapping) stay per-client.
 */
export { gigCtaBranches, approvalBranch, APPROVAL_SLOTS, lifecycleBranches, LIFECYCLE_SLOTS } from './branches'
export type { CtaBranch, ApprovalBranch, LifecycleBranch } from './branches'
export { assignSlots, isEmptyArrangement, SECONDARY_ORDER } from './slots'
export type { CtaArrangement, CtaWidth } from './slots'
export { partiesOf, approvalContextOf } from './parties'
export { SLOT_ORDER, MAX_SECONDARY } from './types'
export type { CtaSlot, ActiveSheet } from './types'
