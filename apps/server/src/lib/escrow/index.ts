/**
 * Escrow business logic, single home for status transitions, fee math,
 * deadline math, and validation. Split per concern: ./state-machine (the
 * stage-0 transition table), ./fees, ./deadlines, ./validation. Barrel keeps
 * the `@server/lib/escrow` import surface stable.
 */

// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
export { acceptedAt, nextStatus, assertCanTransition, transition } from './state-machine'
export type {
  EscrowStatus,
  EscrowTransition,
  Caller,
  TransitionContext,
} from './state-machine'

export { computePlatformFee, computeNetPayout } from './fees'
export type { FeeArgs } from './fees'

export {
  computeAcceptDeadline,
  computeCompletionDeadline,
  computeApprovalDeadline,
} from './deadlines'
export type {
  AcceptDeadlineArgs,
  CompletionDeadlineArgs,
  ApprovalDeadlineArgs,
} from './deadlines'

export { assertGigAsset, assertExchangeAsset } from './validation'

export { assertNotTakenDown, takedownActionFor } from './takedown'

export { buildEscrowTx } from './build-tx'
export type { BuildEscrowTxDeps } from './build-tx'
