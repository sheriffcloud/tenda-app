/**
 * The abandoned-escrow sweep port (#43): what an adapter offers when its chain
 * can recover a stranded escrow WITHOUT the creator's signature.
 *
 * Why a capability and not a plain function: the guarantee is a property of the
 * deployed contract, not of the server. On EVM, `refundExpired` and
 * `reclaimAbandoned` became permissionless in #43 — anyone may call them, and
 * the payout address is `e.creator`, never `msg.sender`, so a sweeper can
 * release the funds but can never take them. A chain whose program still
 * requires the creator's signature simply does not implement this port, and the
 * job then has nothing to do there (Solana until #42).
 *
 * The sweeper spends the RELAYER float on gas and recovers nothing — this is a
 * goodwill service to a creator (very often an agent) who is never coming back
 * to click refund, not a revenue path.
 */
import type { EscrowTransition } from '@server/lib/escrow/state-machine'

/** The two exit transitions a stranded escrow can take without its creator. */
export type SweepableTransition = Extract<
  EscrowTransition,
  'refund_expired' | 'reclaim_abandoned'
>

export interface SweepArgs {
  escrow_id: string
  /** The creator — attribution of the attempt, exactly as buildTx's user_id. */
  creator_user_id: string
  transition: SweepableTransition
  /**
   * The contract THIS escrow is held by (#89 pinning), not the chain's current
   * one — an escrow funded before a redeploy lives in the old contract and must
   * be swept there or not at all.
   */
  escrow_contract: string
}

export interface EscrowSweep {
  /** The hot wallet paying gas for sweeps (the relayer float). */
  readonly sweeper_address: string
  /**
   * Simulate, then broadcast the recovery. Simulation is not an optimisation:
   * it is how an escrow held by a contract generation that PREDATES the
   * permissionless change is skipped — that call reverts `NotCreator`, and
   * finding out by simulation costs nothing while finding out by broadcasting
   * costs a failed transaction's gas on every tick, forever.
   */
  sweep(args: SweepArgs): Promise<{ tx_ref: string }>
}
