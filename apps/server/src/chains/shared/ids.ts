/**
 * escrow_id wire encoding, shared across chains.
 *
 * The DB `escrows.id` (UUIDv4 string) is the canonical identifier. On-chain
 * it travels as 16 raw bytes: the Solana PDA seed and the Solidity `bytes16`
 * (Stage 3) are both this encoding, so conversion lives once, here.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID string → 16 bytes. Throws on malformed input (caller bug). */
export function uuidToBytes(uuid: string): Buffer {
  if (!UUID_RE.test(uuid)) {
    throw new Error(`uuidToBytes: not a UUID: '${uuid}'`)
  }
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}

/** 16 bytes → lowercase UUID string. Throws on wrong length (decoder bug). */
export function bytesToUuid(bytes: Uint8Array | number[]): string {
  const buf = Buffer.from(bytes)
  if (buf.length !== 16) {
    throw new Error(`bytesToUuid: expected 16 bytes, got ${buf.length}`)
  }
  const hex = buf.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
