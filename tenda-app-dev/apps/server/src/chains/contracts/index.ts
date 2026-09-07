/**
 * Per-escrow contract pinning (open_issues #89): which escrow contract holds a
 * given escrow's funds, and which contracts a chain may transact with at all.
 *
 * Named exports rather than `export *`: `export type` marks what is erased and
 * `export` what survives to runtime, and no `__exportStar` loop is emitted —
 * same convention as `lib/escrow-events`.
 */

export { normalizeContractAddress } from './normalize'

export {
  buildContractRegistry,
  contractSourcesFromSecrets,
  loadContractRegistry,
} from './registry'
export type { ChainContractSource, ChainContracts, ContractRegistry } from './registry'

export { resolveEscrowContract } from './resolve'
export type { EscrowContractRef } from './resolve'

// `findUnknownContractEscrows` is the bounded probe `assertEscrowContractsKnown`
// is built from; exported so the probe's limit and cross-chain reporting can be
// asserted without provoking a boot failure.
export { assertEscrowContractsKnown, findUnknownContractEscrows } from './boot-check'
export type { UnknownContractEscrow } from './boot-check'
