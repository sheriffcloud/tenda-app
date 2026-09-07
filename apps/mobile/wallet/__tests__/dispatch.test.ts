/**
 * UnsignedTx dispatcher (Stage 3). Verifies each kind routes to the right
 * transport and that the EVM `from` precedence (live session → verified linked
 * wallet → error) is correct. The Solana path now sources its session token
 * from the adapter (signAndSendStored), not the auth store.
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
jest.mock('@/wallet/allowance', () => ({
  ensureAllowance: jest.fn(),
}))
jest.mock('@/wallet/ensure-session', () => ({
  ensureEvmSession: jest.fn(),
}))

import {
  signAndSendUnsignedTx,
  signSendAndReport,
  UnsupportedUnsignedTxError,
} from '@/wallet/dispatch'
import { signAndSendStored } from '@/wallet/adapters/solana-mwa'
import { sendEvmTransaction } from '@/wallet/adapters/walletconnect'
import { ensureAllowance } from '@/wallet/allowance'
import { ensureEvmSession } from '@/wallet/ensure-session'
import { useAuthStore } from '@/stores/auth.store'
import { useEscrowStore } from '@/stores/escrow.store'
import { VersionedTransaction } from '@solana/web3.js'

const mockDeserialize = VersionedTransaction.deserialize as jest.Mock
const storedMock = signAndSendStored as jest.Mock
const sendEvmMock = sendEvmTransaction as jest.Mock
const authStateMock = useAuthStore.getState as jest.Mock
const escrowStateMock = useEscrowStore.getState as jest.Mock
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

const SOLANA_TX: UnsignedTx = {
  kind: 'solana-tx',
  tx_base64: 'AAAA',
  recent_blockhash: 'bh',
  last_valid_block_height: 1,
}

const EVM_TX: UnsignedTx = { kind: 'evm-tx', to: '0xTo', data: '0xData', value: '0' }

beforeEach(() => {
  authStateMock.mockReturnValue({ evmAddress: null, wallets: [] })
  ensureAllowanceMock.mockReset()
  ensureSessionMock.mockReset().mockResolvedValue(undefined)
  sendEvmMock.mockReset()
})

describe('signAndSendUnsignedTx, solana-tx', () => {
  it('deserializes the wire tx and delegates to the adapter-owned signer', async () => {
    storedMock.mockResolvedValue('sol-sig')
    const ref = await signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet')
    expect(ref).toBe('sol-sig')
    expect(mockDeserialize).toHaveBeenCalledTimes(1)
    expect(storedMock).toHaveBeenCalledWith({ __tx: true }, undefined)
  })

  it('forwards the signed callback to the Solana adapter', async () => {
    storedMock.mockResolvedValue('sol-sig')
    const onSigned = jest.fn()

    await signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet', onSigned)

    expect(storedMock).toHaveBeenCalledWith({ __tx: true }, onSigned)
  })
})

describe('signAndSendUnsignedTx, evm-tx from precedence', () => {
  it('prefers the live session when it is a verified linked wallet', async () => {
    authStateMock.mockReturnValue({
      evmAddress: '0xLive',
      wallets: [
        evmWallet({ address: '0xLive' }),
        evmWallet({ address: '0xOther', is_primary: true }),
      ],
    })
    sendEvmMock.mockResolvedValue('evm-ref')
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(sendEvmMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: '0xLive', to: '0xTo', chainId: 'eip155:84532' }),
    )
  })

  it('ignores a live session that is not a linked wallet (uses the primary)', async () => {
    // e.g. the session wallet was unlinked — wallets[] is the source of trust.
    authStateMock.mockReturnValue({
      evmAddress: '0xStale',
      wallets: [evmWallet({ address: '0xPrimary', is_primary: true })],
    })
    sendEvmMock.mockResolvedValue('evm-ref')
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(sendEvmMock).toHaveBeenCalledWith(expect.objectContaining({ from: '0xPrimary' }))
  })

  it('falls back to the primary verified linked wallet', async () => {
    authStateMock.mockReturnValue({
      evmAddress: null,
      wallets: [
        evmWallet({ address: '0xSecondary' }),
        evmWallet({ address: '0xPrimary', is_primary: true }),
      ],
    })
    sendEvmMock.mockResolvedValue('evm-ref')
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(sendEvmMock).toHaveBeenCalledWith(expect.objectContaining({ from: '0xPrimary' }))
  })

  it('ignores unverified eip155 wallets in the fallback', async () => {
    authStateMock.mockReturnValue({
      evmAddress: null,
      wallets: [evmWallet({ address: '0xUnverified', verified_at: null })],
    })
    await expect(signAndSendUnsignedTx(EVM_TX, 'eip155:84532')).rejects.toThrow(
      'no EVM wallet connected',
    )
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('forwards fee_currency for CELO gas abstraction', async () => {
    authStateMock.mockReturnValue({
      evmAddress: '0xLive',
      wallets: [evmWallet({ address: '0xLive', is_primary: true })],
    })
    sendEvmMock.mockResolvedValue('evm-ref')
    await signAndSendUnsignedTx({ ...EVM_TX, fee_currency: '0xcUSD' }, 'eip155:42220')
    expect(sendEvmMock).toHaveBeenCalledWith(
      expect.objectContaining({ feeCurrency: '0xcUSD' }),
    )
  })
})

describe('signAndSendUnsignedTx, evm-tx connect-on-demand guard (D6)', () => {
  it('runs ensureEvmSession BEFORE broadcasting', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    const order: string[] = []
    ensureSessionMock.mockImplementation(async () => void order.push('ensure'))
    sendEvmMock.mockImplementation(async () => {
      order.push('send')
      return 'evm-ref'
    })
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(order).toEqual(['ensure', 'send'])
  })

  it('does NOT broadcast when the guard fails (e.g. the user declines the connect)', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    ensureSessionMock.mockRejectedValue(new Error('Wallet connection cancelled'))
    await expect(signAndSendUnsignedTx(EVM_TX, 'eip155:84532')).rejects.toThrow('cancelled')
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('leaves the Solana path untouched (no EVM session guard)', async () => {
    storedMock.mockResolvedValue('sol-sig')
    await signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet')
    expect(ensureSessionMock).not.toHaveBeenCalled()
  })
})

describe('signAndSendUnsignedTx, evm-tx approval hint', () => {
  const HINTED: UnsignedTx = {
    ...EVM_TX,
    approval: { token: '0xToken', spender: '0xEscrow', amount_raw: '1000000' },
  }

  it('ensures the allowance BEFORE broadcasting when the hint is present', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    const order: string[] = []
    ensureAllowanceMock.mockImplementation(async () => {
      order.push('allowance')
      return 'approved'
    })
    sendEvmMock.mockImplementation(async () => {
      order.push('send')
      return 'evm-ref'
    })

    await signAndSendUnsignedTx(HINTED, 'eip155:84532')

    expect(ensureAllowanceMock).toHaveBeenCalledWith({
      chainId: 'eip155:84532',
      token: '0xToken',
      spender: '0xEscrow',
      amountRaw: '1000000',
      owner: '0xLive',
    })
    expect(order).toEqual(['allowance', 'send'])
  })

  it('skips the allowance leg entirely when there is no hint (permit/native)', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    sendEvmMock.mockResolvedValue('evm-ref')
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(ensureAllowanceMock).not.toHaveBeenCalled()
  })

  it('a failed approval aborts the flow, the escrow tx is never broadcast', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    ensureAllowanceMock.mockRejectedValue(new Error('approval reverted'))
    await expect(signAndSendUnsignedTx(HINTED, 'eip155:84532')).rejects.toThrow('approval reverted')
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('a hint without a chain_id throws loudly, never silently broadcast a doomed tx', async () => {
    authStateMock.mockReturnValue({ evmAddress: '0xLive', wallets: [evmWallet({ address: '0xLive', is_primary: true })] })
    await expect(signAndSendUnsignedTx(HINTED)).rejects.toBeInstanceOf(UnsupportedUnsignedTxError)
    expect(ensureAllowanceMock).not.toHaveBeenCalled()
    expect(sendEvmMock).not.toHaveBeenCalled()
  })
})

describe('signAndSendUnsignedTx, evm-userop', () => {
  it('throws the typed unsupported error (blocked on the bundler config)', async () => {
    const userOp: UnsignedTx = {
      kind: 'evm-userop',
      user_op: {} as Extract<UnsignedTx, { kind: 'evm-userop' }>['user_op'],
      entry_point: '0xEntry',
    }
    await expect(signAndSendUnsignedTx(userOp)).rejects.toBeInstanceOf(UnsupportedUnsignedTxError)
  })
})

describe('signSendAndReport', () => {
  it('signs then reports the tx_ref to the escrow store', async () => {
    storedMock.mockResolvedValue('sol-sig')
    const reportTx = jest.fn(async () => {})
    escrowStateMock.mockReturnValue({ reportTx })

    const ref = await signSendAndReport({
      unsigned: SOLANA_TX,
      action: 'submit',
      chain_id: 'solana:devnet',
      escrow_id: 'esc-1',
    })

    expect(ref).toBe('sol-sig')
    expect(reportTx).toHaveBeenCalledWith({
      tx_ref: 'sol-sig',
      action: 'submit',
      chain_id: 'solana:devnet',
      escrow_id: 'esc-1',
    })
  })
})
