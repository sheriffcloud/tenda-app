import { evmAppKitNetworks } from '@tenda/shared'
import { EVM_NETWORKS } from '../networks'

describe('EVM_NETWORKS', () => {
  it('starts with every manifest-derived EVM chain, in manifest order', () => {
    // AppKit's default network is the FIRST in the list — it must be a Tenda
    // chain, never the connect-only Ethereum literal.
    const derived = evmAppKitNetworks()
    expect(derived.length).toBeGreaterThan(0)
    expect(EVM_NETWORKS.slice(0, derived.length).map((n) => n.caipNetworkId)).toEqual(
      derived.map((n) => n.caipNetworkId),
    )
  })

  it('appends connect-only Ethereum mainnet last, and never derives it from the manifest', () => {
    const last = EVM_NETWORKS[EVM_NETWORKS.length - 1]
    expect(last?.caipNetworkId).toBe('eip155:1')
    expect(evmAppKitNetworks().some((n) => n.caipNetworkId === 'eip155:1')).toBe(false)
  })
})
