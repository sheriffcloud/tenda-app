/**
 * One spelling per contract address, so equality means equality.
 *
 * EVM addresses are hex and their checksum casing is cosmetic: the same
 * contract legitimately arrives lower-cased from a receipt log, checksummed
 * from a deploy script, and either way from an env var. Comparing those raw
 * makes `chain_contracts` admit one contract twice under two spellings and
 * makes set membership miss — the escrow would be refused as "unknown" by the
 * very registry that lists it. `registry-sync.ts` already learned this lesson
 * for `chains.escrow_program` and compares case-insensitively.
 *
 * Solana base58 is the opposite: casing is IDENTITY there (the alphabet uses
 * both cases as distinct symbols), so lower-casing a program id produces a
 * different, invalid address. Hence one namespace-aware function rather than a
 * `.toLowerCase()` sprinkled at call sites — the two rules are genuinely
 * different and the compiler should make you say which one you mean.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema/chains'

/**
 * Canonical storage/comparison form of a contract or program address.
 *
 * Apply at EVERY write to `chain_contracts.escrow_contract` /
 * `escrows.escrow_contract` and at every membership test, so the stored form
 * and the compared form cannot diverge.
 */
export function normalizeContractAddress(namespace: ChainNamespace, address: string): string {
  switch (namespace) {
    case 'eip155':
      return address.toLowerCase()
    case 'solana':
      // Base58 is case-SENSITIVE. Returned untouched on purpose; see the header.
      return address
  }
}
