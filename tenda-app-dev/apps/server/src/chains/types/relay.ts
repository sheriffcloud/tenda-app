/**
 * The relayed-funding port (#18): what an adapter offers when its chain has a
 * relayer hot wallet. Namespace-specific in what the artifact IS (an EIP-3009
 * authorization on eip155, a partially signed transaction on solana) but one
 * surface to the route, which only speaks the x402 envelope.
 */
import type { RelayPaymentPayload, RelayTerms } from '@tenda/shared'
import type { CreateEscrowPayload } from './build-tx'

export interface RelayedCreateArgs {
  /** The draft's creator — attribution of the attempt, exactly as buildTx. */
  user_id: string
  /** The caller's linked wallet the escrow will name as creator. */
  creator_address: string
  payload: CreateEscrowPayload
}

export interface EscrowRelay {
  /** The relayer hot wallet's address on this chain (gas float only). */
  readonly relayer_address: string
  /** The 402 terms: exactly what the creator must sign, and by when. */
  quote(args: RelayedCreateArgs): Promise<RelayTerms>
  /**
   * Verify the artifact against the terms this draft yields NOW, simulate,
   * broadcast with the relayer paying gas. Refuses with RELAY_REJECTED
   * (details.reason) before anything is broadcast.
   */
  relay(args: RelayedCreateArgs & { payment: RelayPaymentPayload }): Promise<{ tx_ref: string }>
}
