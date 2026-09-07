/**
 * Stage 9D, client mapping for the first-transaction gate. The server lets a
 * user sign up with zero friction (no wallet) and only blocks at the first
 * transaction (escrow create / accept / publish) with 403 WALLET_REQUIRED (no
 * wallet on the escrow's chain) or 403 CONTACT_REQUIRED (no verified
 * email/phone). These aren't dead-end errors, each routes the user to the
 * screen that fixes it. Pure (no toast/nav here) so it stays unit-testable;
 * call sites do the toast + navigation, mirroring lib/auth-flow.
 */

import { ApiClientError } from '@/api/client'

export type TransactionGateReason = 'wallet_required' | 'contact_required'

/** Map a transaction failure to its gate reason, or null for a generic error. */
export function classifyTransactionGateError(err: unknown): TransactionGateReason | null {
  if (err instanceof ApiClientError) {
    if (err.code === 'WALLET_REQUIRED') return 'wallet_required'
    if (err.code === 'CONTACT_REQUIRED') return 'contact_required'
  }
  return null
}

/** User-facing copy for each gate reason. */
export const TRANSACTION_GATE_MESSAGE: Record<TransactionGateReason, string> = {
  wallet_required:
    'Link a wallet to start transacting, the same wallet signs your escrows and receives payouts.',
  contact_required:
    'Verify an email or phone number before your first transaction so we can reach you about it.',
}

/** Where to send the user to clear each gate. The contact gate accepts a
 *  verified email OR phone, so it routes to the Sign-in & security screen. */
export function transactionGateRoute(
  reason: TransactionGateReason,
): '/settings/linked-wallets' | '/settings/security' {
  return reason === 'wallet_required' ? '/settings/linked-wallets' : '/settings/security'
}
