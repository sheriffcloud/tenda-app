/**
 * Cross-chain adapter contract.
 *
 * Every chain (Solana, BASE, CELO, ...) implements ChainAdapter so the rest of
 * the server can route by `chain_id` without knowing which protocol sits
 * underneath. See `multichain-migration-stages/stage-0-foundation.md` § Server.
 *
 * Split into files along the seams the adapter already has (values / events /
 * buildTx / verifyTx / adapter surface); `@server/chains/types` remains the
 * single import path via this barrel, so no caller changed.
 *
 * No `any` / `unknown` casts allowed (project rule). Payloads are discriminated
 * unions per `action`; UserOperation is fully typed; event-payload fields are
 * stringified for u64/u256 precision safety.
 */

// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
export { isAmountRaw } from './values'
export type { ChainId, CaipAccountId, AssetId, AmountRaw } from './values'

export { ESCROW_EVENTS, EVENT_BY_TX_TYPE, ESCROW_TX_TYPES, isEscrowTxType } from './events'
export type { EscrowAction, EscrowEvent, EscrowTxType } from './events'

export type {
  CreateEscrowPayload,
  EscrowIdPayload,
  AssignAcceptPayload,
  SubmitProofPayload,
  DisputeEscrowPayload,
  ResolveDisputePayload,
  BuildTxAction,
  BuildTxArgs,
  UserOperation,
  UnsignedTx,
} from './build-tx'

export type {
  VerifyTxArgs,
  DecodedEvent,
  VerifiedTx,
  EscrowState,
  VerifyAuthSigArgs,
} from './verify'

export type {
  ChainAdapter,
  RpcProvider,
  ChainListener,
  PushService,
  ChainRegistry,
} from './adapter'
