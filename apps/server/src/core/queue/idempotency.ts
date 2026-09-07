/**
 * Single source of truth for BullMQ job IDs across every queue
 * (verify-tx, fiat settle, reputation, ...). Duplicate enqueues with the
 * same `dedupKey` are no-ops at the queue level.
 *
 * Format (stage-2 § Architecture): `${chain_ns}:${tx_ref}:${event_kind}`
 *   examples:
 *     solana:5xj...nQ4:EscrowAccepted
 *     eip155:0xabc...def:EscrowApproved
 *
 * Validation rules:
 *   - chain_ns is lowercase, no colons
 *   - tx_ref is the on-chain reference; Solana base58 sig (~88 chars) or
 *     EVM 0x-prefixed 32-byte hash. We don't parse it, we just forbid the
 *     separator (`:`) so the key is unambiguously parseable.
 *   - event_kind matches the PascalCase wire names from `chains/types.ts`.
 *
 * The pure function is exported so tests (testing-strategy.md § Stage 2 unit)
 * can assert key shape and round-trip parsing.
 */

import {
  chainNamespaceEnum,
  type ChainNamespace,
} from '@tenda/shared/db/schema/chains'
import { ESCROW_EVENTS, type EscrowEvent } from '@server/chains/types'

export interface DedupKeyArgs {
  chain_ns: ChainNamespace
  tx_ref: string
  event: EscrowEvent
}

const SEPARATOR = ':'

// Set typed loosely so the type guard doesn't need an `as` cast, the runtime
// values are still narrowed to `EscrowEvent` by the guard's return type.
const VALID_EVENTS: ReadonlySet<string> = new Set<string>(ESCROW_EVENTS)
const VALID_NAMESPACES: ReadonlySet<string> = new Set<string>(chainNamespaceEnum)

function isEscrowEvent(s: string): s is EscrowEvent {
  return VALID_EVENTS.has(s)
}

function isChainNamespace(s: string): s is ChainNamespace {
  return VALID_NAMESPACES.has(s)
}

export function dedupKey({ chain_ns, tx_ref, event }: DedupKeyArgs): string {
  if (tx_ref.length === 0 || tx_ref.includes(SEPARATOR)) {
    throw new Error(`dedupKey: tx_ref must not be empty or contain "${SEPARATOR}"`)
  }
  return `${chain_ns}${SEPARATOR}${tx_ref}${SEPARATOR}${event}`
}

export function parseDedupKey(key: string): DedupKeyArgs | null {
  const parts = key.split(SEPARATOR)
  if (parts.length !== 3) return null
  const [chain_ns, tx_ref, event] = parts
  if (!isChainNamespace(chain_ns)) return null
  if (tx_ref.length === 0) return null
  if (!isEscrowEvent(event)) return null
  return { chain_ns, tx_ref, event }
}
