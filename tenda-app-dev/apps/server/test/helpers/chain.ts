/**
 * Mocked RPC clients for unit + route + adapter tests. Real RPC calls live
 * under `test/integration/` and are opt-in.
 *
 * Status: types-only scaffold. Concrete impls live next to each adapter
 * under `test/chains/{solana,evm}/...`.
 */

import type { ChainId, DecodedEvent, EscrowEvent } from '@server/chains/types'

export interface MockedRpcController {
  /** Pre-stage a tx receipt the mock will return when `verifyTx(tx_ref)` is called. */
  stageTxReceipt(tx_ref: string, event: DecodedEvent | null): void

  /** Pre-stage a signature-status response (used by reconciliation tests). */
  stageStatus(tx_ref: string, status: 'unknown' | 'pending' | 'confirmed' | 'failed'): void

  /** Asserts the mock saw exactly the expected RPC calls; throws otherwise. */
  expectCalls(expected: ReadonlyArray<{ method: string; tx_ref?: string }>): void
}

export declare function mockSolanaRpc(args: { chain_id: ChainId }): MockedRpcController

export declare function mockEvmRpc(args: { chain_id: ChainId }): MockedRpcController

/** Minimal helper to build a `DecodedEvent` for adapter tests. */
export declare function eventFixture(args: {
  name: EscrowEvent
  escrow_ref: string
  fields?: Record<string, string | number | boolean>
}): DecodedEvent
