/**
 * wallet/send/evm — the EIP-3326 chain pin (the wrong-chain bug's guard) and
 * the guarded eth_sendTransaction / eth_signTypedData_v4 request shapes.
 * The networks module is mocked at its lazy-import seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainNamespace } from '@tenda/shared'

interface FakeModal {
  getAddress: (ns: ChainNamespace) => string | undefined
  getCaipNetwork: ReturnType<typeof vi.fn>
  subscribeAccount: ReturnType<typeof vi.fn>
  subscribeState: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  getProvider: ReturnType<typeof vi.fn>
  switchNetwork: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function fakeModal(): FakeModal {
  return {
    getAddress: () => undefined,
    getCaipNetwork: vi.fn(() => undefined),
    subscribeAccount: vi.fn(() => () => {}),
    subscribeState: vi.fn(() => () => {}),
    open: vi.fn(async () => {}),
    getProvider: vi.fn(() => undefined),
    switchNetwork: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  }
}

const runtimeState = { current: null as { modal: FakeModal } | null }
vi.mock('@/wallet/runtime', () => ({
  loadWalletRuntime: async () =>
    runtimeState.current === null ? { status: 'disabled' } : { status: 'ready', runtime: runtimeState.current },
  peekWalletRuntime: () => runtimeState.current,
}))

// The lazy `import('../reown/networks')` resolves to this mock too.
const FAKE_NETWORK = { id: 84532, name: 'Base Sepolia' }
vi.mock('@/wallet/reown/networks', () => ({
  appKitNetworkForChain: vi.fn((chainId: string) => {
    if (chainId !== 'eip155:84532') throw new Error(`no AppKitNetwork mapped for '${chainId}'`)
    return FAKE_NETWORK
  }),
}))

import { sendEvmTransaction, signEvmTypedData } from '@/wallet/send/evm'

const TX = {
  from: '0xFrom',
  to: '0xTo',
  data: '0xdead',
  value: '1000000',
  chainId: 'eip155:84532',
}

let modal: FakeModal
let request: ReturnType<typeof vi.fn>

beforeEach(() => {
  modal = fakeModal()
  request = vi.fn(async () => '0xhash')
  modal.getProvider = vi.fn((ns: ChainNamespace) => (ns === 'eip155' ? { request } : undefined))
  runtimeState.current = { modal }
})

describe('sendEvmTransaction', () => {
  it('sends the request with a hex-encoded wei value', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:84532' })
    await expect(sendEvmTransaction(TX)).resolves.toBe('0xhash')
    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [{ from: '0xFrom', to: '0xTo', data: '0xdead', value: `0x${(1_000_000).toString(16)}` }],
    })
    expect(modal.switchNetwork).not.toHaveBeenCalled()
  })

  it('feeCurrency rides along only when present (CELO)', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:84532' })
    await sendEvmTransaction({ ...TX, feeCurrency: '0xCUSD' })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: [expect.objectContaining({ feeCurrency: '0xCUSD' })],
      }),
    )
  })

  it('pins the wallet to the tx chain BEFORE the request when it differs', async () => {
    const order: string[] = []
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:8453' }) // wallet on Base mainnet
    modal.switchNetwork.mockImplementation(async () => {
      order.push('switch')
    })
    request.mockImplementation(async () => {
      order.push('send')
      return '0xhash'
    })
    await sendEvmTransaction(TX)
    expect(modal.switchNetwork).toHaveBeenCalledWith(FAKE_NETWORK, { throwOnFailure: true })
    expect(order).toEqual(['switch', 'send'])
  })

  it('a REJECTED switch aborts as a decline — never a wrong-chain broadcast', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:8453' })
    modal.switchNetwork.mockRejectedValue({ code: 4001, message: 'User rejected the request' })
    await expect(sendEvmTransaction(TX)).rejects.toMatchObject({ name: 'WalletError', code: 'declined' })
    expect(request).not.toHaveBeenCalled()
  })

  it('a switch the wallet CANNOT do aborts with instructions (web has no scope fallback)', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:8453' })
    modal.switchNetwork.mockRejectedValue(new Error('Unrecognized chain ID'))
    await expect(sendEvmTransaction(TX)).rejects.toMatchObject({
      name: 'WalletError',
      code: 'network',
      message: expect.stringMatching(/switch/i),
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('no live EVM provider is a typed network error', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:84532' })
    modal.getProvider = vi.fn(() => undefined)
    await expect(sendEvmTransaction(TX)).rejects.toMatchObject({ code: 'network' })
  })

  it('a non-string wallet answer throws instead of reporting garbage as a tx hash', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:84532' })
    request.mockResolvedValue({ weird: true })
    await expect(sendEvmTransaction(TX)).rejects.toThrow(/non-string tx hash/)
  })

  it('an unconfigured build throws the typed no_wallet error', async () => {
    runtimeState.current = null
    await expect(sendEvmTransaction(TX)).rejects.toMatchObject({ code: 'no_wallet' })
  })
})

describe('signEvmTypedData', () => {
  it('forwards the server-built payload verbatim as a JSON string', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:84532' })
    const typedData = { domain: { name: 'USDC' }, message: { value: '1' } }
    request.mockResolvedValue('0xsig')
    await expect(
      signEvmTypedData({ from: '0xFrom', typedData, chainId: 'eip155:84532' }),
    ).resolves.toBe('0xsig')
    expect(request).toHaveBeenCalledWith({
      method: 'eth_signTypedData_v4',
      params: ['0xFrom', JSON.stringify(typedData)],
    })
  })

  it('also pins the chain first — the permit domain is chain-bound', async () => {
    modal.getCaipNetwork.mockReturnValue({ caipNetworkId: 'eip155:8453' })
    await signEvmTypedData({ from: '0xFrom', typedData: {}, chainId: 'eip155:84532' })
    expect(modal.switchNetwork).toHaveBeenCalledWith(FAKE_NETWORK, { throwOnFailure: true })
  })
})
