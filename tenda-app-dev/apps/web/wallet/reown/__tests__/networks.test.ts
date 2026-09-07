/**
 * Manifest ↔ Reown network bridge. The bridge is duplicated in
 * apps/admin/providers/reown/networks.ts by design (each Next app owns its
 * wallet wiring); THIS test is the anti-drift tripwire — a manifest chain
 * the bridge cannot serve fails the module import itself.
 */
import { describe, expect, it } from 'vitest'
import { solana, solanaDevnet } from '@reown/appkit/networks'
import { CHAIN_MANIFEST, chainNamespaceOf, evmChainNumericId } from '@tenda/shared'
import { appKitNetworks, evmNetworks, appKitNetworkForChain } from '@/wallet/reown/networks'

describe('manifest coverage', () => {
  it('maps EVERY manifest chain to an AppKit network (fail-loud contract)', () => {
    // The module already threw at import time if a chain were unservable;
    // assert per-chain anyway so the failure names the chain.
    for (const chain of CHAIN_MANIFEST) {
      expect(appKitNetworkForChain(chain.id), chain.id).toBeDefined()
    }
    expect(appKitNetworks).toHaveLength(CHAIN_MANIFEST.length)
  })

  it('evmNetworks is exactly the eip155 subset of the manifest', () => {
    const evmCount = CHAIN_MANIFEST.filter((c) => chainNamespaceOf(c.id) === 'eip155').length
    expect(evmNetworks).toHaveLength(evmCount)
  })

  it('throws (never silently drops) for a chain the manifest does not carry', () => {
    expect(() => appKitNetworkForChain('eip155:999999')).toThrow(/no AppKitNetwork mapped/)
  })
})

describe('EVM networks are DERIVED from the manifest, not hand-mapped presets', () => {
  // The property that makes a new EVM chain zero web code: every EVM network
  // carries the manifest's OWN facts, so a network can never drift from the
  // chain the manifest declares. The id assertion is the one that would have
  // caught the stale zeroGGalileoTestnet preset (16601 for a chain that
  // answers 16602).
  it('every EVM network carries the manifest chain id and public RPC', () => {
    for (const chain of CHAIN_MANIFEST) {
      if (chainNamespaceOf(chain.id) !== 'eip155') continue
      const network = appKitNetworkForChain(chain.id)
      expect(network.id, chain.id).toBe(evmChainNumericId(chain.id))
      expect(network.rpcUrls.default.http, chain.id).toEqual([chain.publicRpcUrl])
    }
  })

  it('solana chains still resolve to the Reown presets (manifest has no solana RPC)', () => {
    expect(appKitNetworkForChain('solana:mainnet')).toBe(solana)
    expect(appKitNetworkForChain('solana:devnet')).toBe(solanaDevnet)
  })

  it('switchNetwork receives the SAME object the modal was registered with', () => {
    // AppKit matches networks it was constructed with; a per-call rebuild
    // would hand it an unknown identity.
    for (const chain of CHAIN_MANIFEST) {
      expect(appKitNetworks, chain.id).toContain(appKitNetworkForChain(chain.id))
    }
  })
})
