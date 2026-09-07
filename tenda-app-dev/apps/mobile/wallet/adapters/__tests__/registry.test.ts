/**
 * The picker's adapter lookup. `requireAdapter` is called on the resume path
 * after a wallet bounces back into the app, where the id comes from persisted
 * state rather than from the picker — so an id that no longer maps to a
 * registered adapter must fail loudly and name itself, not return undefined
 * and surface later as "cannot read property of undefined".
 */
// The Reown modules are ESM that jest does not transform, and this suite only
// needs the adapters' identities — so the two the EVM adapter reaches for are
// stubbed exactly as walletconnect.test.ts stubs them. The adapters themselves
// stay real: a registry test that mocked them would assert its own fixture.
jest.mock('@/wallet/solana-rpc', () => ({ solanaRpcTransport: { broadcast: jest.fn() } }))
jest.mock('../mwa-shared', () => ({ withMwaRetry: jest.fn(), authorizeSession: jest.fn() }))
jest.mock('@solana/web3.js', () => ({
  PublicKey: class {},
  VersionedTransaction: class {},
}))
jest.mock('../../reown/config', () => ({ reownConfigured: true }))
jest.mock('../../reown/connection-signal', () => ({
  connectionSignal: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    getProvider: jest.fn(),
    getAccount: jest.fn(),
    getPeerRedirect: jest.fn(),
  },
}))

import { adapters, findAdapter, requireAdapter } from '../registry'

describe('adapter registry', () => {
  it('lists every adapter with a unique id, in picker display order', () => {
    const ids = adapters.map((a) => a.id)
    expect(ids).toEqual(['walletconnect', 'solana-mwa', 'phantom'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('finds a registered adapter by id', () => {
    expect(findAdapter('phantom')?.id).toBe('phantom')
  })

  it('returns undefined for an id nobody registered', () => {
    expect(findAdapter('coinbase')).toBeUndefined()
  })

  it('requireAdapter names the wallet it could not resolve', () => {
    expect(() => requireAdapter('coinbase')).toThrow(/coinbase/)
  })

  it('requireAdapter returns the same object findAdapter does', () => {
    expect(requireAdapter('walletconnect')).toBe(findAdapter('walletconnect'))
  })
})
