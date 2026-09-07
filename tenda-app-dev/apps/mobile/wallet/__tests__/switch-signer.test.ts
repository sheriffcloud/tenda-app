/**
 * `switchSignerWith` — adopting a different wallet as this device's signer.
 *
 * The trust rules are the point: a wallet the user picks in their wallet app
 * is a STRANGER until `wallets[]` says otherwise, and on a BOUND escrow only
 * one specific wallet can ever sign. Both refusals must name what would work,
 * because "not linked" on its own leaves the reader with nothing to do.
 */
import { BOUND_WALLET_REFUSAL, WalletError, type LinkedWallet } from '@tenda/shared'

const mockSetWalletAddress = jest.fn()
jest.mock('@/lib/secure-store', () => ({
  setWalletAddress: (...a: unknown[]) => mockSetWalletAddress(...a),
}))

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth.store'
// eslint-disable-next-line import/first
import { switchSignerWith } from '@/wallet/switch-signer'
// eslint-disable-next-line import/first
import type { SignerTransport } from '@/wallet/switch-signer'

function wallet(over: Partial<LinkedWallet> = {}): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xLinked1',
    is_primary: true,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** A picker choice that connects as `address`. */
function adapterReturning(address: string, ns: 'eip155' | 'solana' = 'eip155'): SignerTransport {
  return {
    disconnect: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue({ namespace: ns, chainId: 'x', address, walletId: 'w' }),
  }
}

beforeEach(() => {
  mockSetWalletAddress.mockReset().mockResolvedValue(undefined)
  useAuthStore.setState({ wallets: [], evmAddress: null, walletAddress: null })
})

test('adopts a linked wallet and publishes it to the EVM signer slot', async () => {
  useAuthStore.setState({ wallets: [wallet({ address: '0xPicked1' })] })
  const adapter = adapterReturning('0xPicked1')

  await expect(switchSignerWith(adapter, 'eip155')).resolves.toBe('0xPicked1')

  expect(useAuthStore.getState().evmAddress).toBe('0xPicked1')
  // EVM's slot is session-scoped: nothing persisted.
  expect(mockSetWalletAddress).not.toHaveBeenCalled()
})

test('a Solana switch persists the address as well as setting the slot', async () => {
  // The Solana slot is read as a pubkey by balance and quote surfaces and
  // survives a restart, so the store and secure storage move together.
  useAuthStore.setState({ wallets: [wallet({ chain_ns: 'solana', address: 'SoLPicked' })] })

  await switchSignerWith(adapterReturning('SoLPicked', 'solana'), 'solana')

  expect(useAuthStore.getState().walletAddress).toBe('SoLPicked')
  expect(mockSetWalletAddress).toHaveBeenCalledWith('SoLPicked')
})

test('disconnects BEFORE connecting, or a live session hands back the same wallet', async () => {
  useAuthStore.setState({ wallets: [wallet({ address: '0xPicked1' })] })
  const order: string[] = []
  const adapter: SignerTransport = {
    disconnect: jest.fn(() => { order.push('disconnect'); return Promise.resolve() }),
    connect: jest.fn((opts?: { fresh?: boolean }) => {
      order.push(`connect:${String(opts?.fresh)}`)
      return Promise.resolve({ namespace: 'eip155' as const, chainId: 'x', address: '0xPicked1', walletId: 'w' })
    }),
  }

  await switchSignerWith(adapter, 'eip155')

  expect(order).toEqual(['disconnect', 'connect:true'])
})

test('a STRANGER wallet is refused, and the message names the ones that would work', async () => {
  useAuthStore.setState({ wallets: [wallet({ address: '0xLinked1' })] })

  await expect(switchSignerWith(adapterReturning('0xStrange'), 'eip155')).rejects.toThrow(
    /Connect one of your linked wallets \(0xLi…ked1\)/,
  )
  // Nothing adopted: the slot must not move to a wallet that cannot sign.
  expect(useAuthStore.getState().evmAddress).toBeNull()
})

test('with nothing linked at all the refusal drops the empty parenthesis', async () => {
  await expect(switchSignerWith(adapterReturning('0xStrange'), 'eip155')).rejects.toThrow(
    'Connect one of your linked wallets to sign this transaction',
  )
})

test('a BOUND escrow refuses any wallet but its own, by name', async () => {
  useAuthStore.setState({
    wallets: [wallet({ address: '0xBound11' }), wallet({ address: '0xOther11', is_primary: false })],
  })

  await expect(
    switchSignerWith(adapterReturning('0xOther11'), 'eip155', '0xBound11'),
  ).rejects.toThrow(BOUND_WALLET_REFUSAL.wrongWallet('0xBound11'))
  expect(useAuthStore.getState().evmAddress).toBeNull()
})

test('a bound wallet that is no longer linked refuses BEFORE opening any wallet app', async () => {
  // A picker cannot fix this — re-linking can — so the wallet app must not be
  // opened for a choice that could not succeed.
  useAuthStore.setState({ wallets: [wallet({ address: '0xOther11' })] })
  const adapter = adapterReturning('0xOther11')

  await expect(
    switchSignerWith(adapter, 'eip155', '0xUnlinked'),
  ).rejects.toThrow(BOUND_WALLET_REFUSAL.unlinked('0xUnlinked'))
  expect(adapter.connect).not.toHaveBeenCalled()
  expect(adapter.disconnect).not.toHaveBeenCalled()
})

test('the bound wallet itself is adopted, case-insensitively on EVM', async () => {
  useAuthStore.setState({ wallets: [wallet({ address: '0xBoundAA' })] })

  await expect(
    switchSignerWith(adapterReturning('0xboundaa'), 'eip155', '0xBOUNDAA'),
  ).resolves.toBe('0xboundaa')
})

test('a declined connection surfaces as the typed decline, untouched', async () => {
  useAuthStore.setState({ wallets: [wallet({ address: '0xPicked1' })] })
  const adapter: SignerTransport = {
    disconnect: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockRejectedValue(new WalletError('declined', 'Wallet connection cancelled')),
  }

  await expect(switchSignerWith(adapter, 'eip155')).rejects.toMatchObject({ code: 'declined' })
})

test('the trust check runs against the list as it is AFTER connecting', async () => {
  // The wallet round-trip is long enough for a refreshMe to land; judging the
  // pick against a stale list would refuse a wallet the user just linked.
  const adapter: SignerTransport = {
    disconnect: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn(() => {
      useAuthStore.setState({ wallets: [wallet({ address: '0xJustLinked' })] })
      return Promise.resolve({ namespace: 'eip155' as const, chainId: 'x', address: '0xJustLinked', walletId: 'w' })
    }),
  }

  await expect(switchSignerWith(adapter, 'eip155')).resolves.toBe('0xJustLinked')
})

test('a Solana switch PERSISTS before it publishes — a failed write moves nothing', async () => {
  // Setting the slot first and persisting second reports an error the user can
  // act on while the switch has already taken effect: a worse lie than the
  // failure. `signInWithWallet` persists first for the same reason.
  mockSetWalletAddress.mockRejectedValue(new Error('secure store unavailable'))
  useAuthStore.setState({ wallets: [wallet({ chain_ns: 'solana', address: 'SoLPicked' })] })

  await expect(
    switchSignerWith(adapterReturning('SoLPicked', 'solana'), 'solana'),
  ).rejects.toThrow('secure store unavailable')

  expect(useAuthStore.getState().walletAddress).toBeNull()
})
