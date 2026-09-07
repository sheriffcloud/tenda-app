/**
 * WALLET_CHAINS derivation: a non-production build resolves to the devnet
 * Solana registry id and a manifest TESTNET EVM chain (never mainnet).
 */
import { describe, expect, it } from 'vitest'
import { CHAIN_MANIFEST } from '@tenda/shared'
import { SOLANA_NETWORK, WALLET_CHAINS } from '@/wallet/config'

describe('WALLET_CHAINS (test build = development env)', () => {
  it('solana resolves through the shared registry id, matching the cluster', () => {
    expect(SOLANA_NETWORK).toBe('devnet')
    expect(WALLET_CHAINS.solana).toBe('solana:devnet')
  })

  it('eip155 is a real manifest chain of testnet kind', () => {
    const entry = CHAIN_MANIFEST.find((c) => c.id === WALLET_CHAINS.eip155)
    expect(entry).toBeDefined()
    expect(entry?.namespace).toBe('eip155')
    expect(entry?.kind).toBe('testnet')
  })
})
