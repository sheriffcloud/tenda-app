/**
 * The on-chain proof commitment: a 32-byte digest over the evidence URLs,
 * encoded the way each chain family expects (base58 for Solana, 0x-hex for
 * EVM). The chain stores it and checks only its length — nothing recomputes
 * it — so this is a tamper-evidence seal, not a validated field.
 *
 * Its own module, and not part of `useEscrowActions`, for two reasons. It is
 * PURE, so importing it should not drag in the hook's wallet-dispatch chain,
 * which is exactly the friction the golden-vector suite used to work around
 * with five stub modules. And the two-leg submit pushed the hook to the edge
 * of the house size limit — this is the cohesive piece to lift out rather than
 * the one to trim. apps/web's `hooks/escrow/proof-hash.ts` is the twin.
 *
 * Order-SENSITIVE by construction: it hashes a list. Deciding WHICH list, and
 * in what canonical order, belongs to the caller — see `attachedProofUrls`.
 */
import { sha256 } from '@noble/hashes/sha2'
import { Buffer } from 'buffer'
import bs58 from 'bs58'

export function proofHashFor(chainId: string, urls: string[]): string {
  const digest = sha256(new TextEncoder().encode(urls.join('\n')))
  return chainId.startsWith('solana:')
    ? bs58.encode(digest)
    : `0x${Buffer.from(digest).toString('hex')}`
}
