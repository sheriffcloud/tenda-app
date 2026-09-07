/**
 * The BOUND-signer guard in dispatch — split from dispatch.test.ts to keep both
 * files inside the 300-line limit.
 *
 * When the chain has already fixed which wallet may sign a transition, the
 * server names it on the unsigned tx. Broadcasting from a different one sends
 * a transaction the contract's party check reverts: gas spent, and a failure
 * whose reason the user never sees. So dispatch refuses first, BY NAME —
 * the same sentence the signer row's Connect affordance acts on.
 */
import type { LinkedWallet, UnsignedTx } from '@tenda/shared'

// dispatch only touches VersionedTransaction.deserialize, stub it so we never
// parse a real wire transaction. The fn is created INSIDE the factory (ESM
// imports run before any module-scope const, so an outer ref would be
// undefined at first require); we retrieve it from the mocked module below.
jest.mock('@solana/web3.js', () => ({
  VersionedTransaction: { deserialize: jest.fn(() => ({ __tx: true })) },
}))

jest.mock('@/wallet/adapters/solana-mwa', () => ({
  signAndSendStored: jest.fn(),
}))
jest.mock('@/wallet/adapters/walletconnect', () => ({
  sendEvmTransaction: jest.fn(),
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: jest.fn() },
}))
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: { getState: jest.fn() },
}))
// ensureAllowance moved to @tenda/shared (2026-08-15). Partial mock: real
// module for everything else, a spy ONLY for the allowance leg under test.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  ensureAllowance: jest.fn(),
}))
jest.mock('@/wallet/ensure-session', () => ({
  ensureEvmSession: jest.fn(),
}))

import { signAndSendUnsignedTx } from '@/wallet/dispatch'
import { sendEvmTransaction } from '@/wallet/adapters/walletconnect'
import { ensureAllowance } from '@tenda/shared'
import { ensureEvmSession } from '@/wallet/ensure-session'
import { useAuthStore } from '@/stores/auth.store'

const sendEvmMock = sendEvmTransaction as jest.Mock
const authStateMock = useAuthStore.getState as jest.Mock
const ensureAllowanceMock = ensureAllowance as jest.Mock
const ensureSessionMock = ensureEvmSession as jest.Mock

function evmWallet(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xLinked',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  } as LinkedWallet
}

const EVM_TX: UnsignedTx = { kind: 'evm-tx', to: '0xTo', data: '0xData', value: '0' }

beforeEach(() => {
  authStateMock.mockReturnValue({ evmAddress: null, wallets: [] })
  ensureAllowanceMock.mockReset()
  ensureSessionMock.mockReset().mockResolvedValue(undefined)
  sendEvmMock.mockReset()
})

describe('signAndSendUnsignedTx, bound signer', () => {
  it('refuses BEFORE broadcast when the escrow is bound to another wallet', async () => {
    // The contract's party check would revert this — gas spent, and a failure
    // whose reason the user never sees. Refuse by NAME instead, which is the
    // sentence the signer row's Connect affordance acts on.
    authStateMock.mockReturnValue({
      evmAddress: '0xConnected',
      wallets: [
        evmWallet({ address: '0xConnected', is_primary: true }),
        evmWallet({ address: '0xBound' }),
      ],
    })

    await expect(
      signAndSendUnsignedTx({ ...EVM_TX, signer_address: '0xBound' }, 'eip155:84532'),
    ).rejects.toThrow(/Connect 0xBound, the wallet this escrow is signed by/)
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('lets the bound wallet through, case-insensitively', async () => {
    // EVM addresses are checksum-agnostic; a case difference between the wire
    // and the session is not a different wallet.
    authStateMock.mockReturnValue({
      evmAddress: '0xboundaa',
      wallets: [evmWallet({ address: '0xboundaa', is_primary: true })],
    })
    sendEvmMock.mockResolvedValue('evm-ref')

    await signAndSendUnsignedTx({ ...EVM_TX, signer_address: '0xBOUNDAA' }, 'eip155:84532')

    expect(sendEvmMock).toHaveBeenCalledWith(expect.objectContaining({ from: '0xboundaa' }))
  })

  it('leaves an UNBOUND transition alone — a free signer is not a mismatch', async () => {
    authStateMock.mockReturnValue({
      evmAddress: '0xLive',
      wallets: [evmWallet({ address: '0xLive', is_primary: true })],
    })
    sendEvmMock.mockResolvedValue('evm-ref')

    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')

    expect(sendEvmMock).toHaveBeenCalledWith(expect.objectContaining({ from: '0xLive' }))
  })
})
