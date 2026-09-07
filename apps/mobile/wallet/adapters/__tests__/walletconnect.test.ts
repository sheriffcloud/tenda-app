/**
 * WalletConnect (Reown) EVM adapter. The bridge (`reown/connection-signal`) and
 * Reown config are mocked so we exercise the adapter's own logic, the
 * personal_sign / eth_sendTransaction request shapes, decline→null mapping, and
 * the direct-RPC receipt poll, without AppKit or a device.
 */
// Defined inside the factory (jest hoists jest.mock above this file's consts,
// so any outer reference would still be in its TDZ when the factory runs); the
// jest.fns are retrieved off the imported mocked object below.
jest.mock('../../reown/connection-signal', () => ({
  connectionSignal: {
    connect: jest.fn(),
    disconnect: jest.fn(() => Promise.resolve()),
    getProvider: jest.fn(),
    getAccount: jest.fn(),
    getPeerRedirect: jest.fn(() => 'trust://'),
  },
}))
let mockReownConfigured = true
jest.mock('../../reown/config', () => ({
  get reownConfigured() {
    return mockReownConfigured
  },
}))

import { Buffer } from 'buffer'
import { Linking } from 'react-native'
import {
  walletConnectAdapter,
  sendEvmTransaction,
  signEvmTypedData,
  getEvmTransactionStatus,
} from '../walletconnect'
import { connectionSignal } from '../../reown/connection-signal'
import { WC_REQUEST_TIMEOUT_MS } from '../../reown/request-guard'
import { WalletError } from '@/wallet/errors'
import type { SpikeAccount } from '../../types'

const mockConnect = connectionSignal.connect as jest.Mock
const mockDisconnect = connectionSignal.disconnect as jest.Mock
const mockGetProvider = connectionSignal.getProvider as jest.Mock
const mockGetAccount = connectionSignal.getAccount as jest.Mock
const mockGetPeerRedirect = connectionSignal.getPeerRedirect as jest.Mock
const mockOpenURL = Linking.openURL as jest.Mock

beforeEach(() => {
  mockOpenURL.mockReset().mockResolvedValue(undefined)
  mockGetPeerRedirect.mockReturnValue('trust://')
})

const account: SpikeAccount = {
  namespace: 'eip155',
  chainId: 'eip155:8453',
  address: '0xABC',
  walletId: 'walletconnect',
}

function mockProvider(request: jest.Mock) {
  mockGetProvider.mockReturnValue({ request })
}

describe('walletConnectAdapter metadata', () => {
  it('is an eip155 aggregator with a tagline and no bundled icon', () => {
    expect(walletConnectAdapter.id).toBe('walletconnect')
    expect(walletConnectAdapter.name).toBe('EVM Wallet')
    expect(walletConnectAdapter.tagline).toBeTruthy()
    expect(walletConnectAdapter.namespaces).toEqual(['eip155'])
    expect(walletConnectAdapter.iconSource).toBeUndefined()
  })

  it('is available when Reown is configured and always reports installed', async () => {
    await expect(walletConnectAdapter.isAvailable()).resolves.toBe(true)
    await expect(walletConnectAdapter.isInstalled()).resolves.toBe(true)
  })

  it('delegates connect / disconnect / getRestoredAccount to the bridge', async () => {
    mockConnect.mockResolvedValueOnce(account)
    await expect(walletConnectAdapter.connect()).resolves.toBe(account)

    await walletConnectAdapter.disconnect()
    expect(mockDisconnect).toHaveBeenCalled()

    mockGetAccount.mockReturnValueOnce(account)
    await expect(walletConnectAdapter.getRestoredAccount()).resolves.toBe(account)
  })
})

describe('signMessage', () => {
  it('requests personal_sign with the hex-encoded message and address', async () => {
    const request = jest.fn().mockResolvedValue('0xsignature')
    mockProvider(request)
    const result = await walletConnectAdapter.signMessage(account, 'hello')
    expect(result).toEqual({ signature: '0xsignature', message: 'hello' })
    expect(request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['0x' + Buffer.from('hello', 'utf8').toString('hex'), '0xABC'],
    })
    // The connected wallet is foregrounded so the prompt is actually seen.
    expect(mockOpenURL).toHaveBeenCalledWith('trust://')
  })

  it('skips the foreground deep link when none is known (no throw)', async () => {
    mockGetPeerRedirect.mockReturnValue(undefined)
    mockProvider(jest.fn().mockResolvedValue('0xsig'))
    await expect(walletConnectAdapter.signMessage(account, 'hi')).resolves.toMatchObject({
      signature: '0xsig',
    })
    expect(mockOpenURL).not.toHaveBeenCalled()
  })

  it('still signs when foregrounding the wallet throws (best-effort)', async () => {
    mockOpenURL.mockRejectedValue(new Error('no activity'))
    mockProvider(jest.fn().mockResolvedValue('0xsig'))
    await expect(walletConnectAdapter.signMessage(account, 'hi')).resolves.toMatchObject({
      signature: '0xsig',
    })
  })

  it('throws when no provider is connected', async () => {
    mockGetProvider.mockReturnValue(undefined)
    await expect(walletConnectAdapter.signMessage(account, 'hi')).rejects.toBeInstanceOf(WalletError)
    await expect(walletConnectAdapter.signMessage(account, 'hi')).rejects.toMatchObject({ code: 'network' })
  })

  it('throws when the wallet returns a non-string signature', async () => {
    mockProvider(jest.fn().mockResolvedValue(42))
    await expect(walletConnectAdapter.signMessage(account, 'hi')).rejects.toThrow('non-string signature')
  })
})

describe('authenticate', () => {
  it('connects, signs the built message, and returns the bundle', async () => {
    mockConnect.mockResolvedValueOnce(account)
    mockProvider(jest.fn().mockResolvedValue('0xsig'))
    const result = await walletConnectAdapter.authenticate(() => 'MESSAGE')
    expect(result).toEqual({ account, signature: '0xsig', message: 'MESSAGE' })
  })

  it('plain login does NOT disconnect first (reuses a restored session, no blocking round-trip)', async () => {
    // Login passes no opts → connectThenSign skips the disconnect. Logout clears
    // the WC session so a stale one can't be reused across accounts.
    mockConnect.mockResolvedValueOnce(account)
    mockProvider(jest.fn().mockResolvedValue('0xsig'))
    await walletConnectAdapter.authenticate(() => 'm')
    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(mockConnect).toHaveBeenCalledWith(undefined) // ordinary connect, may reuse session
  })

  it('returns null when the user declines the connection', async () => {
    mockConnect.mockRejectedValueOnce(new WalletError('declined', 'nope'))
    await expect(walletConnectAdapter.authenticate(() => 'm')).resolves.toBeNull()
  })

  it('returns null when the user rejects the signature (EIP-1193 4001)', async () => {
    mockConnect.mockResolvedValueOnce(account)
    mockProvider(jest.fn().mockRejectedValue({ code: 4001, message: 'user rejected' }))
    await expect(walletConnectAdapter.authenticate(() => 'm')).resolves.toBeNull()
  })

  it('disconnects first for linking too (forceFresh)', async () => {
    mockConnect.mockResolvedValueOnce(account)
    mockProvider(jest.fn().mockResolvedValue('0xsig'))
    await walletConnectAdapter.authenticate(() => 'm', { forceFresh: true })
    expect(mockDisconnect).toHaveBeenCalled()
    // …and the connect is told to re-pick rather than reuse the dropped session.
    expect(mockConnect).toHaveBeenCalledWith({ fresh: true })
  })
})

describe('sendEvmTransaction', () => {
  it('sends eth_sendTransaction with hex value on the chain scope', async () => {
    const request = jest.fn().mockResolvedValue('0xhash')
    mockProvider(request)
    const hash = await sendEvmTransaction({
      from: '0xABC',
      to: '0xDEF',
      data: '0x',
      value: '1000',
      chainId: 'eip155:8453',
    })
    expect(hash).toBe('0xhash')
    expect(request).toHaveBeenCalledWith(
      {
        method: 'eth_sendTransaction',
        params: [{ from: '0xABC', to: '0xDEF', data: '0x', value: '0x3e8' }],
      },
      'eip155:8453',
    )
    // Wallet is foregrounded to approve the tx too.
    expect(mockOpenURL).toHaveBeenCalledWith('trust://')
  })

  it('includes feeCurrency for CELO and defaults the scope to the primary chain', async () => {
    const request = jest.fn().mockResolvedValue('0xhash')
    mockProvider(request)
    await sendEvmTransaction({ from: '0xA', to: '0xB', data: '0x', value: '0', feeCurrency: '0xcUSD' })
    const [args, scope] = request.mock.calls[0]
    expect(args.params[0]).toMatchObject({ feeCurrency: '0xcUSD', value: '0x0' })
    expect(scope).toMatch(/^eip155:/)
  })

  it('throws when no provider is connected', async () => {
    mockGetProvider.mockReturnValue(undefined)
    await expect(
      sendEvmTransaction({ from: '0xA', to: '0xB', data: '0x', value: '0' }),
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('throws when the wallet returns a non-string hash', async () => {
    mockProvider(jest.fn().mockResolvedValue(null))
    await expect(
      sendEvmTransaction({ from: '0xA', to: '0xB', data: '0x', value: '0' }),
    ).rejects.toThrow('non-string tx hash')
  })

  it('a wallet that never answers rejects with the guard timeout and drops the session', async () => {
    // The lost-relay-response scenario: the request promise never settles.
    // Pre-guard this froze the signing modal until the app was killed.
    jest.useFakeTimers()
    try {
      mockProvider(jest.fn().mockReturnValue(new Promise(() => {})))
      const pending = sendEvmTransaction({ from: '0xA', to: '0xB', data: '0x', value: '0' })
      // Attach the handler BEFORE advancing so the rejection is never
      // observed as unhandled, then advance async so the foreground step's
      // microtasks complete and the guard's timer registers before it fires.
      const expectation = expect(pending).rejects.toMatchObject({
        name: 'WalletError',
        code: 'timeout',
      })
      await jest.advanceTimersByTimeAsync(WC_REQUEST_TIMEOUT_MS)
      await expectation
      expect(mockDisconnect).toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('chain pinning (EIP-3326)', () => {
  // The session reports Base mainnet; requests target Base Sepolia.
  const onBase = { ...account, chainId: 'eip155:8453' }
  const TX = { from: '0xA', to: '0xB', data: '0x', value: '0', chainId: 'eip155:84532' }

  afterEach(() => {
    mockGetAccount.mockReset()
  })

  it('a known chain mismatch switches the wallet BEFORE sending the tx', async () => {
    mockGetAccount.mockReturnValue(onBase)
    const request = jest.fn().mockImplementation(({ method }: { method: string }) =>
      Promise.resolve(method === 'wallet_switchEthereumChain' ? null : '0xhash'),
    )
    mockProvider(request)

    await expect(sendEvmTransaction(TX)).resolves.toBe('0xhash')
    // Switch first (target chain as hex, sent on the CURRENT chain's scope)…
    expect(request).toHaveBeenNthCalledWith(
      1,
      { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] },
      'eip155:8453',
    )
    // …then the tx on its own scope.
    expect(request.mock.calls[1][0].method).toBe('eth_sendTransaction')
    expect(request.mock.calls[1][1]).toBe('eip155:84532')
  })

  it('no switch when the session is already on the target chain', async () => {
    mockGetAccount.mockReturnValue({ ...account, chainId: 'eip155:84532' })
    const request = jest.fn().mockResolvedValue('0xhash')
    mockProvider(request)

    await sendEvmTransaction(TX)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].method).toBe('eth_sendTransaction')
  })

  it('no switch when the session chain is unknown (falls back to scope routing)', async () => {
    mockGetAccount.mockReturnValue(null)
    const request = jest.fn().mockResolvedValue('0xhash')
    mockProvider(request)

    await sendEvmTransaction(TX)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('a REJECTED switch aborts as a decline with no tx ever published', async () => {
    mockGetAccount.mockReturnValue(onBase)
    const request = jest.fn().mockImplementation(({ method }: { method: string }) =>
      method === 'wallet_switchEthereumChain'
        ? Promise.reject({ code: 4001, message: 'user rejected' })
        : Promise.resolve('0xhash'),
    )
    mockProvider(request)

    await expect(sendEvmTransaction(TX)).rejects.toMatchObject({
      name: 'WalletError',
      code: 'declined',
    })
    expect(request).toHaveBeenCalledTimes(1) // never reached eth_sendTransaction
  })

  it('a wallet that CANNOT switch (4902/unsupported) still sends on the scope', async () => {
    mockGetAccount.mockReturnValue(onBase)
    const request = jest.fn().mockImplementation(({ method }: { method: string }) =>
      method === 'wallet_switchEthereumChain'
        ? Promise.reject({ code: 4902, message: 'unrecognized chain' })
        : Promise.resolve('0xhash'),
    )
    mockProvider(request)

    await expect(sendEvmTransaction(TX)).resolves.toBe('0xhash')
    expect(request.mock.calls[1][1]).toBe('eip155:84532')
  })

  it('typed-data signing pins too; personal_sign never does', async () => {
    mockGetAccount.mockReturnValue(onBase)
    const request = jest.fn().mockImplementation(({ method }: { method: string }) =>
      Promise.resolve(method === 'wallet_switchEthereumChain' ? null : '0xsig'),
    )
    mockProvider(request)

    await signEvmTypedData({ from: '0xA', typedData: {}, chainId: 'eip155:84532' })
    expect(request.mock.calls[0][0].method).toBe('wallet_switchEthereumChain')

    request.mockClear()
    await walletConnectAdapter.signMessage(onBase, 'hi')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].method).toBe('personal_sign')
  })
})

describe('signEvmTypedData', () => {
  it('forwards the stringified payload verbatim on the chain scope', async () => {
    const request = jest.fn().mockResolvedValue('0xsig')
    mockProvider(request)
    const typedData = { domain: { name: 'USDC' }, message: { value: '1' } }
    await expect(
      signEvmTypedData({ from: '0xABC', typedData, chainId: 'eip155:84532' }),
    ).resolves.toBe('0xsig')
    expect(request).toHaveBeenCalledWith(
      { method: 'eth_signTypedData_v4', params: ['0xABC', JSON.stringify(typedData)] },
      'eip155:84532',
    )
  })

  it('throws when the wallet returns a non-string signature', async () => {
    mockProvider(jest.fn().mockResolvedValue(undefined))
    await expect(
      signEvmTypedData({ from: '0xABC', typedData: {}, chainId: 'eip155:84532' }),
    ).rejects.toThrow('non-string signature')
  })
})

describe('getEvmTransactionStatus', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  function respondWith(result: unknown): void {
    fetchMock.mockResolvedValue({ json: async () => ({ jsonrpc: '2.0', id: 1, result }) })
  }

  it('queries the primary chain RPC with eth_getTransactionReceipt', async () => {
    respondWith({ status: '0x1' })
    await getEvmTransactionStatus('0xtx', 'eip155:84532')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/^https?:\/\//)
    expect(JSON.parse(init.body)).toMatchObject({
      method: 'eth_getTransactionReceipt',
      params: ['0xtx'],
    })
  })

  it('maps receipt status 0x1 → confirmed', async () => {
    respondWith({ status: '0x1' })
    await expect(getEvmTransactionStatus('0xtx', 'eip155:84532')).resolves.toBe('confirmed')
  })

  it('maps receipt status 0x0 → failed', async () => {
    respondWith({ status: '0x0' })
    await expect(getEvmTransactionStatus('0xtx', 'eip155:84532')).resolves.toBe('failed')
  })

  it('returns not_found when the receipt is null (still pending)', async () => {
    respondWith(null)
    await expect(getEvmTransactionStatus('0xtx', 'eip155:84532')).resolves.toBe('not_found')
  })

  it('returns not_found when the RPC body has no result field', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ jsonrpc: '2.0', id: 1 }) })
    await expect(getEvmTransactionStatus('0xtx', 'eip155:84532')).resolves.toBe('not_found')
  })

  it('returns not_found for an unknown receipt status', async () => {
    respondWith({ status: '0x2' })
    await expect(getEvmTransactionStatus('0xtx', 'eip155:84532')).resolves.toBe('not_found')
  })
})

describe('walletConnectAdapter availability when Reown is unconfigured', () => {
  afterEach(() => {
    mockReownConfigured = true
  })

  it('reports isAvailable false', async () => {
    mockReownConfigured = false
    await expect(walletConnectAdapter.isAvailable()).resolves.toBe(false)
  })
})
