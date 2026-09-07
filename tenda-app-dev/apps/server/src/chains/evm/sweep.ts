/**
 * EVM implementation of the sweep port (#43).
 *
 * Thin by design: the calldata comes from the SAME builder the creator's own
 * refund route uses, and the signing/broadcast comes from the SAME relayer the
 * x402 funding path uses. A sweep is not a new kind of transaction — it is the
 * transaction the creator would have sent, sent by us because they did not.
 */
import type { BuildTxArgs } from '@server/chains/types'
import type { EscrowSweep, SweepArgs } from '@server/chains/types/sweep'
import { buildEvmCall } from './builders'
import type { EvmRelayer } from './relay/relayer'

/** Transition → the contract entry point, typed against the builder's own union. */
const SWEEP_ACTION = {
  refund_expired: 'refundExpired',
  reclaim_abandoned: 'reclaimAbandoned',
} as const satisfies Record<SweepArgs['transition'], BuildTxArgs['action']>

/**
 * These two entry points take the escrow id and nothing else, so the builder
 * needs no resolved addresses — and cannot silently start needing them without
 * failing this file's type check.
 */
const NO_CONTEXT = {
  asset_address: null,
  assigned_counterparty_address: null,
  worker_address: null,
  permit_encodable: false,
} as const

export function evmEscrowSweep(relayer: EvmRelayer): EscrowSweep {
  return {
    sweeper_address: relayer.address,
    async sweep(args) {
      const { data } = buildEvmCall(
        {
          action: SWEEP_ACTION[args.transition],
          // Attribution only: the builder ignores it for these actions, and so
          // does the CONTRACT — `msg.sender` is read by neither, which is the
          // whole reason this port can exist.
          user_id: args.creator_user_id,
          payload: { escrow_id: args.escrow_id },
        },
        NO_CONTEXT,
      )
      const call = { to: args.escrow_contract as `0x${string}`, data }
      // A revert here — wrong status, window not open, or an escrow held by a
      // contract generation that PREDATES #43 and still demands the creator —
      // throws before anything is broadcast.
      await relayer.simulate(call)
      return { tx_ref: await relayer.send(call) }
    },
  }
}
