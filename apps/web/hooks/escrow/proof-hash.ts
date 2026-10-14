/**
 * The on-chain proof commitment: a 32-byte digest over the evidence URLs,
 * encoded the way each chain family expects (base58 for Solana, 0x-hex for
 * EVM). The chain stores it and checks only its length — nothing recomputes
 * it — so this is a tamper-evidence seal, not a validated field.
 *
 * Its own module, and not part of `useEscrowActions`, for two reasons. It is
 * PURE, so importing it should not drag in the hook's wallet-dispatch chain
 * (mobile's golden-vector test carries a comment about exactly that friction).
 * And the hook crossed the 300-line house limit when the two-leg submit landed
 * — this is the cohesive piece to lift out rather than the one to trim.
 *
 * Order-SENSITIVE by construction: it hashes a list. Deciding WHICH list, and
 * in what canonical order, belongs to the caller — see `attachedProofUrls`.
 */
import { sha256 } from '@noble/hashes/sha2'
import bs58 from 'bs58'

export function proofHashFor(chainId: string, urls: string[]): string {
  const digest = sha256(new TextEncoder().encode(urls.join('\n')))
  return chainId.startsWith('solana:')
    ? bs58.encode(digest)
    : `0x${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
