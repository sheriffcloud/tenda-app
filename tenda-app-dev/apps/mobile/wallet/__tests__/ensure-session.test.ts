import type { LinkedWallet } from '@tenda/shared'
import type { WalletAccount } from '@tenda/shared'

jest.mock('@/wallet/reown/connection-signal', () => ({
  connectionSignal: {
    getProvider: jest.fn(),
    getAccount: jest.fn(),
    connect: jest.fn(),
  },
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: jest.fn(), setState: jest.fn() },
}))

import { ensureEvmSession } from '@/wallet/ensure-session'
import { connectionSignal } from '@/wallet/reown/connection-signal'
import { useAuthStore } from '@/stores/auth.store'
import { WalletError } from '@tenda/shared'

const EVM = '0xAbC0000000000000000000000000000000000001'
const PROVIDER = { request: jest.fn() }

const account = (address = EVM): WalletAccount => ({
  namespace: 'eip155',
  chainId: 'eip155:8453',
  address,
  walletId: 'walletconnect',
})

function linked(address = EVM): LinkedWallet[] {
  return [{ chain_ns: 'eip155', address, is_primary: true, verified_at: '2026-01-01T00:00:00Z' }]
}

const getProvider = connectionSignal.getProvider as jest.Mock
const getAccount = connectionSignal.getAccount as jest.Mock
const connect = connectionSignal.connect as jest.Mock
const getState = useAuthStore.getState as jest.Mock
const setState = useAuthStore.setState as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  getState.mockReturnValue({ wallets: linked() })
})

test('already connected to a linked wallet: no reconnect, syncs the signer slot', async () => {
  getProvider.mockReturnValue(PROVIDER)
  getAccount.mockReturnValue(account())

  await ensureEvmSession()

  expect(connect).not.toHaveBeenCalled()
  expect(setState).toHaveBeenCalledWith({ evmAddress: EVM })
})

test('no live session: opens the connect flow, then syncs the connected wallet', async () => {
  getProvider.mockReturnValueOnce(undefined).mockReturnValue(PROVIDER)
  getAccount.mockReturnValue(null)
  connect.mockResolvedValue(account())

  await ensureEvmSession()

  expect(connect).toHaveBeenCalledTimes(1)
  expect(setState).toHaveBeenCalledWith({ evmAddress: EVM })
})

test('connected wallet is NOT one of the linked wallets: throws, does not sync', async () => {
  getProvider.mockReturnValue(PROVIDER)
  getAccount.mockReturnValue(account('0xdEAd000000000000000000000000000000000000'))

  await expect(ensureEvmSession()).rejects.toThrow(/linked wallets/)
  expect(setState).not.toHaveBeenCalled()
})

test('connect resolves but no provider materialises: throws no-wallet', async () => {
  getProvider.mockReturnValue(undefined)
  getAccount.mockReturnValue(null)
  connect.mockResolvedValue(account())

  await expect(ensureEvmSession()).rejects.toBeInstanceOf(WalletError)
  await expect(ensureEvmSession()).rejects.toThrow(/No EVM wallet connected/)
})

test('provider present but no account (edge): throws no-wallet without connecting', async () => {
  getProvider.mockReturnValue(PROVIDER)
  getAccount.mockReturnValue(null)

  await expect(ensureEvmSession()).rejects.toThrow(/No EVM wallet connected/)
  expect(connect).not.toHaveBeenCalled()
})

test('user declines the connect prompt: the decline propagates', async () => {
  getProvider.mockReturnValue(undefined)
  getAccount.mockReturnValue(null)
  connect.mockRejectedValue(new WalletError('declined', 'Wallet connection cancelled'))

  await expect(ensureEvmSession()).rejects.toMatchObject({ code: 'declined' })
})
