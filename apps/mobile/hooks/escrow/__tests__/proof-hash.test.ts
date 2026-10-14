/**
 * proofHashFor — the on-chain proof commitment. Golden vectors, fixed and
 * NOT recomputed through the code path under test, so a drifted separator,
 * encoder, or hash silently changing the digest fails loudly. apps/web pins
 * the identical vectors: the two clients must commit the same digest for the
 * same proof URLs (dispute-time auditability depends on it).
 */
import { proofHashFor } from '../proof-hash'

const URLS = ['https://res.example/proof-1.png', 'https://res.example/proof-2.pdf']

describe('proofHashFor golden vectors', () => {
  it('EVM chains commit 0x-hex sha256 over the \\n-joined URLs', () => {
    expect(proofHashFor('eip155:84532', URLS)).toBe(
      '0x03be519bee2bbf8290b34f9e516330c549e27518262a8b7baa092ad3fd0c83d8',
    )
  })

  it('Solana chains commit the same digest base58-encoded', () => {
    expect(proofHashFor('solana:devnet', URLS)).toBe(
      'FcYSG9dyCYy3bxfpi6tGbRduTgXUjW8vBaQuHBmTc9D',
    )
  })

  it('a single URL commits to itself with no separator involved', () => {
    expect(proofHashFor('eip155:8453', [URLS[0]])).toBe(
      '0xaf1049e251ccaca12739d411be0c85e79136c53bb20c1ccb14012c9c1bcc281d',
    )
  })

  it('the digest is order-sensitive (commits to upload order)', () => {
    expect(proofHashFor('eip155:8453', [...URLS].reverse())).not.toBe(
      proofHashFor('eip155:8453', URLS),
    )
  })
})
