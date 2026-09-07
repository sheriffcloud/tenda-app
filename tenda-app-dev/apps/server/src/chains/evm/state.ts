/**
 * On-chain reads the adapter needs BEFORE it can build a transaction: the
 * escrow tuple decode, and the per-action address/asset resolution built on it.
 *
 * Lifted out of the `evmAdapter` closure so the two are reachable and readable
 * on their own — they were the only parts of a 410-line factory that did no
 * building at all. The closure over `args`/`rpc` becomes an explicit
 * `EvmAdapterContext` parameter, which is the whole behavioural difference:
 * same code, dependencies now stated rather than captured.
 *
 * `EvmAdapterArgs` below is an `import type` from ./index, which ./index also
 * imports from — a cycle on paper that TypeScript erases, so nothing circular
 * reaches the runtime. Keep it type-only: turning it into a value import would
 * make it real. `EvmAdapterArgs` stays declared in ./index because that is the
 * adapter's public surface (`@server/chains/evm`).
 */

import { AppError } from '@server/lib/errors'
import { ErrorCode, ESCROW_STATUS_ORDER } from '@tenda/shared'
import { bytesToUuid } from '@server/chains/ids'
import type { BuildTxArgs, EscrowState } from '@server/chains/types'
import { escrowIdHex } from './create-params'
import { ZERO_ADDRESS, type EvmRpc } from './rpc'
import type { EvmAdapterArgs } from './index'

/** What the extracted reads need from the adapter that owns them. */
export interface EvmAdapterContext {
  args: EvmAdapterArgs
  rpc: EvmRpc
}

// On-chain status enum → wire status, indexed by the contract's uint8. Sourced
// from the single shared order (guarded against both contracts by
// check-contract-parity) so a contract enum reorder can't silently mis-decode.
const EVM_STATUS: ReadonlyArray<EscrowState['status']> = ESCROW_STATUS_ORDER

export async function fetchEscrowState(
  ctx: EvmAdapterContext,
  escrow_ref: string,
  /** Contract to read from; defaults to the chain's current one. */
  contract: `0x${string}` = ctx.args.escrow_contract,
): Promise<EscrowState | null> {
  const tuple = await ctx.rpc.readEscrow(contract, escrow_ref as `0x${string}`)
  if (tuple === null) return null
  const status = EVM_STATUS[tuple.status]
  if (status === undefined) return null // unknown enum value, treat as absent
  return {
    escrow_ref,
    escrow_id: bytesToUuid(Buffer.from(tuple.escrow_id.slice(2), 'hex')),
    kind: tuple.kind === 0 ? 'gig' : 'exchange',
    asset_address: tuple.asset === ZERO_ADDRESS ? null : tuple.asset,
    amount_raw: tuple.amount.toString(),
    creator_address: tuple.creator,
    counterparty_address: tuple.counterparty === ZERO_ADDRESS ? null : tuple.counterparty,
    assigned_counterparty_address:
      tuple.assigned_counterparty === ZERO_ADDRESS ? null : tuple.assigned_counterparty,
    status,
    accept_deadline_unix: Number(tuple.accept_deadline),
    completion_duration_seconds: Number(tuple.completion_duration),
    completion_deadline_unix: Number(tuple.completion_deadline),
    approval_deadline_unix: Number(tuple.approval_deadline),
    dispute_bond_raw: tuple.dispute_bond.toString(),
    is_seeker: tuple.is_seeker,
    requires_approval: tuple.requires_approval,
    unassign_window_seconds: Number(tuple.unassign_window_seconds),
    // The contract doesn't store creation time; reconciliation uses the
    // EscrowCreated event's block timestamp via the DB row instead.
    created_at_unix: 0,
  }
}

export async function buildContext(
  ctx: EvmAdapterContext,
  build: BuildTxArgs,
  /**
   * The contract this build targets — the escrow's own, which after a redeploy
   * is not necessarily the chain's current one. Every on-chain read below must
   * use it: reading state from the current contract for an escrow held by a
   * previous one answers about a different escrow, or about none at all.
   */
  contract: `0x${string}` = ctx.args.escrow_contract,
) {
  // A permit can only be encoded against the contract its signature names as
  // spender, which is always the current one (see `encodesPermit` in ./index).
  const permit_encodable = contract.toLowerCase() === ctx.args.escrow_contract.toLowerCase()

  if (build.action === 'createEscrow') {
    const { token_address } = await ctx.args.deps.resolveAsset(build.payload.asset)
    const assigned =
      build.payload.assigned_counterparty_user_id !== undefined
        ? await ctx.args.deps.resolveWalletAddress(build.payload.assigned_counterparty_user_id)
        : null
    return {
      asset_address: token_address,
      assigned_counterparty_address: assigned,
      worker_address: null,
      permit_encodable,
      escrow_state: null,
    }
  }
  if (build.action === 'disputeEscrow') {
    // Bond denomination follows the escrow's asset, read it on-chain so
    // the value rule can't drift from contract state.
    const state = await fetchEscrowState(ctx, escrowIdHex(build.payload.escrow_id), contract)
    // A null read means the contract we are building against has no such
    // escrow. Absence must not fall through to `asset_address: null`, which
    // means NATIVE — that would quietly denominate the bond in the gas token
    // instead of the escrow's ERC-20.
    //
    // Since #89 the contract is resolved per ESCROW, so a superseded deployment
    // is no longer the likely cause — the row's stamp routed us here. What
    // remains is a genuine disagreement between the DB and the chain (an escrow
    // whose create never actually landed), and refusing is still the honest
    // answer. The message names the contract consulted so the two can be
    // compared.
    if (state === null) {
      throw new AppError(
        422,
        ErrorCode.ESCROW_NOT_FUNDED,
        `escrow ${build.payload.escrow_id} does not exist in escrow contract ` +
          `${contract} on ${ctx.args.chain_id}`,
      )
    }
    return {
      asset_address: state.asset_address,
      assigned_counterparty_address: null,
      worker_address: null,
      permit_encodable,
      // The dispute build already paid for this read — the signer resolver
      // reuses it instead of a second eth_call.
      escrow_state: state,
    }
  }
  if (build.action === 'assignAccept') {
    return {
      asset_address: null,
      assigned_counterparty_address: null,
      // The application's chosen wallet when the route validated one; the
      // primary-first resolver only for pre-choice applications.
      worker_address:
        build.payload.worker_address ??
        (await ctx.args.deps.resolveWalletAddress(build.payload.worker_user_id)),
      permit_encodable,
      escrow_state: null,
    }
  }
  return {
    asset_address: null,
    assigned_counterparty_address: null,
    worker_address: null,
    permit_encodable,
    escrow_state: null,
  }
}
