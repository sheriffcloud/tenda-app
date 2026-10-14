/**
 * CAIP-2 / CAIP-10 parsing and namespace-aware wallet-address identity, shared
 * by server (user_wallets dedup + lookups) and client (the admin resolve-sign
 * pre-flight). EVM (eip155) addresses are case-INsensitive — the EIP-55
 * checksum is a display convention, so the same wallet arrives in different
 * case. Solana (base58) is case-SENSITIVE — different case is a different
 * address.
 *
 * The chain-id and address PREDICATES live here too (`isEvmChainId`,
 * `isEvmAddress`) because this module has only a type import and therefore no
 * runtime dependencies — which is what lets `CHAIN_MANIFEST`'s module-load
 * validator import it without a cycle. Proven at #104 and relied on again at
 * #105; keep it that way.
 */
import type { ChainNamespace } from '../db/schema/chains'

/**
 * The CAIP-2 namespace of a chain id ('solana:devnet' → 'solana'); undefined
 * if unknown. Type-only import (no pgEnum value) so this stays client-safe —
 * pulling the enum value would drag drizzle's pg-core into the browser bundle.
 * The literal set mirrors `chainNamespaceEnum` (the stable CAIP-2 namespaces).
 */
export function chainNamespaceOf(chain_id: string): ChainNamespace | undefined {
  const ns = chain_id.split(':')[0]
  return ns === 'solana' || ns === 'eip155' ? ns : undefined
}

/**
 * Whether a CAIP-2 id is a well-formed eip155 one: `eip155:<positive integer>`.
 *
 * THE ONE DEFINITION of that shape, and it lives beside `chainNamespaceOf`
 * because both parse a CAIP-2 id and neither may import the manifest. Two
 * consumers depend on it agreeing with itself: `assertManifestValid` refuses an
 * eip155 entry it rejects, and `evmChainNumericId` throws on one — which
 * together are what let the agent card (#105) parse a manifest id with no null
 * branch of its own.
 *
 * Decimal digits only: `Number('0x1')` coerces to 1, so a hex reference would
 * otherwise pass as chain 1 — mainnet.
 */
export function isEvmChainId(chain_id: string): boolean {
  const [namespace, reference] = chain_id.split(':')
  return (
    namespace === 'eip155' &&
    reference !== undefined &&
    /^[0-9]+$/.test(reference) &&
    Number(reference) > 0
  )
}

/**
 * A syntactically valid EVM address: `0x` and exactly 40 hex digits.
 *
 * CASE IS NOT CHECKED, deliberately. EIP-55 encodes a checksum in the CASING of
 * those hex digits, so a mixed-case address may be checksummed-and-correct,
 * checksummed-and-WRONG, or simply a lower-cased address someone up-cased. This
 * predicate answers only the shape question, which is what both callers need:
 * one guards an untrusted URL segment before it reaches the database, the other
 * validates a hand-written manifest entry at module load. Neither can act on a
 * checksum result, and rejecting mixed case outright would refuse the spelling
 * most wallets display.
 *
 * Shared rather than re-declared (#104): the same literal had been written in
 * the manifest validator and the agent-card route, which is where a third copy
 * gets added without anyone noticing one of them drifting.
 */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

/** Canonical form: EVM lower-cased, Solana untouched. */
export function normalizeChainAddress(namespace: ChainNamespace, address: string): string {
  return namespace === 'eip155' ? address.toLowerCase() : address
}

/** Same wallet, namespace-aware (folds case on BOTH sides for EVM). */
export function sameChainAddress(namespace: ChainNamespace, a: string, b: string): boolean {
  return normalizeChainAddress(namespace, a) === normalizeChainAddress(namespace, b)
}
