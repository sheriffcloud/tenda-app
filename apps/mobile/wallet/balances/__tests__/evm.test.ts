/**
 * EVM balance reader, native via eth_getBalance, USDC via ERC-20 balanceOf
 * (eth_call), parsed from hex. Verifies the balanceOf calldata, hex→decimal
 * conversion, an unknown chain → [], and that one failing asset read is omitted
 * (not thrown). RPC is a mocked global fetch.
 */
import type { ChainRegistryEntry } from '@tenda/shared'
import { evmBalanceReader } from '@/wallet/balances/evm'

const ADDR = '0xAbC0000000000000000000000000000000000001'

// Base Sepolia is in EVM_NETWORKS (caipNetworkId 'eip155:84532').
function chain(over: Partial<ChainRegistryEntry> = {}): ChainRegistryEntry {
  return {
    id: 'eip155:84532',
    namespace: 'eip155',
    display_name: 'Base Sepolia',
    escrow_address: '0xEscrow',
    assets: [
      { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xToken', supports_permit: true },
      { id: 'ETH_BASE', symbol: 'ETH', decimals: 18, is_stable: false, token_address: null, supports_permit: false },
    ],
    ...over,
  }
}

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function rpcReply(result: unknown) {
  return { json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
}

test('reads native (eth_getBalance) and USDC (balanceOf), converting hex→base units', async () => {
  fetchMock.mockImplementation((_url: string, init: { body: string }) => {
    const { method } = JSON.parse(init.body) as { method: string }
    // 0x5f5e100 = 100_000_000 (100 USDC, 6dp); 0xde0b6b3a7640000 = 1e18 (1 ETH).
    return Promise.resolve(rpcReply(method === 'eth_call' ? '0x5f5e100' : '0xde0b6b3a7640000'))
  })

  const out = await evmBalanceReader.read(ADDR, chain())
  const usdc = out.find((b) => b.assetId === 'USDC_BASE')
  const eth = out.find((b) => b.assetId === 'ETH_BASE')
  expect(usdc?.amountRaw).toBe('100000000')
  expect(eth?.amountRaw).toBe('1000000000000000000')

  // balanceOf selector + 32-byte left-padded address.
  const call = fetchMock.mock.calls.find((c) => JSON.parse(c[1].body).method === 'eth_call')
  const data = JSON.parse(call![1].body).params[0].data as string
  expect(data).toBe(`0x70a08231${ADDR.slice(2).toLowerCase().padStart(64, '0')}`)
})

test('an unknown / non-EVM chain id yields no balances (no RPC call)', async () => {
  const out = await evmBalanceReader.read(ADDR, chain({ id: 'eip155:999999' }))
  expect(out).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a hung RPC is aborted by the timeout, the read is omitted, never strands', async () => {
  jest.useFakeTimers()
  // Native never resolves until aborted; USDC answers immediately.
  fetchMock.mockImplementation((_url: string, init: { body: string; signal?: AbortSignal }) => {
    const { method } = JSON.parse(init.body) as { method: string }
    if (method === 'eth_call') return Promise.resolve(rpcReply('0x5f5e100'))
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
  })
  const pending = evmBalanceReader.read(ADDR, chain())
  await jest.advanceTimersByTimeAsync(11_000) // past RPC_TIMEOUT_MS (10s)
  const out = await pending
  expect(out.find((b) => b.assetId === 'USDC_BASE')?.amountRaw).toBe('100000000')
  expect(out.find((b) => b.assetId === 'ETH_BASE')).toBeUndefined() // timed out → omitted
  jest.useRealTimers()
})

test('empty hex (0x) and a rejected read are handled, 0 / omitted, never thrown', async () => {
  fetchMock.mockImplementation((_url: string, init: { body: string }) => {
    const { method } = JSON.parse(init.body) as { method: string }
    if (method === 'eth_call') return Promise.resolve(rpcReply('0x')) // empty → 0
    return Promise.reject(new Error('rpc down')) // native read fails → omitted
  })
  const out = await evmBalanceReader.read(ADDR, chain())
  expect(out.find((b) => b.assetId === 'USDC_BASE')?.amountRaw).toBe('0')
  expect(out.find((b) => b.assetId === 'ETH_BASE')).toBeUndefined()
})
