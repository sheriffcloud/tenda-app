/**
 * Receipt → `VerifiedTx`: confirmations, execution status, and the decode that
 * turns escrow logs into a wire event.
 *
 * Lifted out of the `evmAdapter` factory when the decoder became
 * contract-SET-aware (open_issues #89) — the factory was already 247 lines and
 * this is the half of it that does no building. The decoding itself stays in
 * ./verify; this is the orchestration around it.
 */

import type { VerifiedTx, VerifyTxArgs } from '@server/chains/types'
import { decodeEscrowLogs } from './verify'
import type { EvmRpc } from './rpc'

export interface VerifyReceiptDeps {
  rpc: Pick<EvmRpc, 'getTransactionReceipt' | 'getBlockNumber'>
  chain_id: string
  /** Every contract this chain may have emitted escrow events from. */
  escrow_contracts: readonly string[]
  min_confirmations: number
}

export async function verifyEvmReceipt(
  deps: VerifyReceiptDeps,
  tx_ref: string,
  verify: VerifyTxArgs,
): Promise<VerifiedTx> {
  const receipt = await deps.rpc.getTransactionReceipt(tx_ref as `0x${string}`)
  if (receipt === null) return { confirmed: false, reason: 'receipt not found' }

  const head = await deps.rpc.getBlockNumber()
  if (head - receipt.block_number < BigInt(deps.min_confirmations)) {
    return { confirmed: false, pending: true, reason: 'awaiting confirmations' }
  }
  if (receipt.status !== 'success') {
    return { confirmed: true, failed: true, reason: 'transaction reverted' }
  }

  const events = decodeEscrowLogs(receipt.logs, deps.escrow_contracts, deps.chain_id)
  const match =
    verify.expected_event !== undefined
      ? events.find((e) => e.name === verify.expected_event)
      : events[0]

  if (match === undefined) {
    // Wide net = the polling producer, which enqueues every transaction touching
    // a watched contract and states no expectation. There, a confirmed tx with no
    // escrow event of ours is not a FAILURE — it is traffic that is simply not an
    // escrow state change — and recording it as a failed attempt would pollute
    // `tx_attempts` with transactions no user ever submitted.
    //
    // Gated on the wide net exactly as the Solana verifier gates it
    // (chains/solana/verify.ts). With an expectation the caller DID submit
    // something and does need to hear that it did not do what it claimed, so a
    // missing event stays a failure — widening `irrelevant` to that path would
    // silently stop failed client-pinged transactions from ever being marked.
    if (verify.expected_event === undefined) {
      return { confirmed: true, irrelevant: true, reason: 'no escrow event in transaction' }
    }
    return {
      confirmed: true,
      failed: true,
      reason: `expected event ${verify.expected_event} not found`,
    }
  }

  if (verify.escrow_id !== undefined && match.fields.escrow_id !== verify.escrow_id) {
    return { confirmed: true, failed: true, reason: 'escrow_id mismatch' }
  }
  return { confirmed: true, failed: false, event: match }
}
