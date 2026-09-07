/**
 * initReown wiring: brand facts come from APP_INFO (never typed inline),
 * custodial features stay off, and the runtime is a singleton. The wallet
 * libraries are mocked — what's under test is OUR construction contract.
 */
import { describe, expect, it, vi } from 'vitest'
import { APP_INFO } from '@tenda/shared'

vi.mock('client-only', () => ({}))

const createAppKit = vi.fn<(options: unknown) => { kind: string }>(() => ({ kind: 'modal' }))
vi.mock('@reown/appkit/react', () => ({ createAppKit: (options: unknown) => createAppKit(options) }))

const wagmiConfig = { kind: 'wagmi-config' }
vi.mock('@reown/appkit-adapter-wagmi', () => ({
  WagmiAdapter: class {
    wagmiConfig = wagmiConfig
    constructor(public readonly args: unknown) {}
  },
}))
vi.mock('@reown/appkit-adapter-solana', () => ({ SolanaAdapter: class {} }))
vi.mock('@/wallet/reown/networks', () => ({
  appKitNetworks: [{ id: 'all-1' }],
  evmNetworks: [{ id: 'evm-1' }],
}))

import { initReown } from '@/wallet/reown/config'

describe('initReown', () => {
  it('registers the APP_INFO identity and keeps custodial features OFF', () => {
    const runtime = initReown('pid', 'https://app.tendahq.com')

    expect(createAppKit).toHaveBeenCalledTimes(1)
    const args = createAppKit.mock.calls[0]?.[0] as {
      projectId: string
      metadata: { name: string; description: string; url: string }
      features: Record<string, unknown>
      networks: unknown
    }
    expect(args.projectId).toBe('pid')
    expect(args.metadata).toMatchObject({
      name: APP_INFO.name,
      description: APP_INFO.description,
      url: 'https://app.tendahq.com',
    })
    // Non-custodial doctrine: no email/social key minting, no swaps/onramp.
    expect(args.features).toEqual({ analytics: false, email: false, socials: [], swaps: false, onramp: false })
    expect(runtime.wagmiConfig).toBe(wagmiConfig)
  })

  it('is a singleton — later calls reuse the runtime, never re-init', () => {
    // The module-level runtime survives from the previous test (that is the
    // point); clearMocks wiped the call log, so ANY call here would be a
    // re-initialization.
    const first = initReown('pid', 'https://app.tendahq.com')
    const second = initReown('other', 'https://elsewhere.example')
    expect(second).toBe(first)
    expect(createAppKit).not.toHaveBeenCalled()
  })
})
