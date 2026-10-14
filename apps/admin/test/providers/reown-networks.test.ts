/**
 * Manifest ↔ Reown network bridge (the admin copy of apps/web's tripwire —
 * the bridge is duplicated per Next app by design, so each app carries its
 * own proof that every manifest chain is servable and that EVM networks are
 * DERIVED from the manifest rather than hand-mapped presets).
 */
import { describe, expect, test } from 'vitest'
import { solana, solanaDevnet } from '@reown/appkit/networks'
import { CHAIN_MANIFEST, chainNamespaceOf, evmChainNumericId } from '@tenda/shared'
import { appKitNetworks, evmNetworks, appKitNetworkForChain } from '@/providers/reown/networks'

describe('manifest coverage', () => {
  test('maps EVERY manifest chain to an AppKit network (fail-loud contract)', () => {
    for (const chain of CHAIN_MANIFEST) {
      expect(appKitNetworkForChain(chain.id), chain.id).toBeDefined()
    }
    expect(appKitNetworks).toHaveLength(CHAIN_MANIFEST.length)
  })

  test('evmNetworks is exactly the eip155 subset of the manifest', () => {
    const evmCount = CHAIN_MANIFEST.filter((c) => chainNamespaceOf(c.id) === 'eip155').length
    expect(evmNetworks).toHaveLength(evmCount)
  })

  test('throws (never silently drops) for a chain the manifest does not carry', () => {
    expect(() => appKitNetworkForChain('eip155:999999')).toThrow(/no AppKitNetwork mapped/)
  })
})

describe('EVM networks are DERIVED from the manifest, not hand-mapped presets', () => {
  test('every EVM network carries the manifest chain id and public RPC', () => {
    for (const chain of CHAIN_MANIFEST) {
      if (chainNamespaceOf(chain.id) !== 'eip155') continue
      const network = appKitNetworkForChain(chain.id)
      expect(network.id, chain.id).toBe(evmChainNumericId(chain.id))
      expect(network.rpcUrls.default.http, chain.id).toEqual([chain.publicRpcUrl])
    }
  })

  test('solana chains still resolve to the Reown presets (manifest has no solana RPC)', () => {
    expect(appKitNetworkForChain('solana:mainnet')).toBe(solana)
    expect(appKitNetworkForChain('solana:devnet')).toBe(solanaDevnet)
  })

  test('switchNetwork receives the SAME object the modal was registered with', () => {
    for (const chain of CHAIN_MANIFEST) {
      expect(appKitNetworks, chain.id).toContain(appKitNetworkForChain(chain.id))
    }
  })
})
