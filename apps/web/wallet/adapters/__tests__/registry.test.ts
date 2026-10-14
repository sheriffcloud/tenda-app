/** Registry seam: lookup by id, loud failure for an unregistered wallet. */
import { describe, expect, it } from 'vitest'
import { adapters, findAdapter, requireAdapter } from '@/wallet/adapters/registry'

describe('adapter registry', () => {
  it('registers the Reown adapter with both namespaces', () => {
    expect(adapters.map((a) => a.id)).toEqual(['reown'])
    expect(findAdapter('reown')?.namespaces).toEqual(['solana', 'eip155'])
  })

  it('requireAdapter returns a registered adapter and throws for an unregistered id', () => {
    expect(requireAdapter('reown').id).toBe('reown')
    expect(findAdapter('ledger-usb')).toBeUndefined()
    expect(() => requireAdapter('ledger-usb')).toThrow(/No adapter registered/)
  })
})
