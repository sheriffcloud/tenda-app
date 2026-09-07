/**
 * wallet/dispatch — the web UnsignedTx dispatcher. Mirrors mobile's suite:
 * signer resolution over the linked registry, connect-on-demand ordering,
 * the allowance-before-broadcast contract, the loud evm-userop refusal, and
 * signSendAndReport's report leg.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainNamespace, LinkedWallet, UnsignedTx } from '@tenda/shared'

const ensureSessionOnMock = vi.fn()
vi.mock('@/wallet/send/session', () => ({
  // Dispatch rides the required-aware guard; the fake records both args so
  // the signer-contract tests can assert what was demanded of the session.
  ensureSignerSession: (ns: ChainNamespace, required?: string) => ensureSessionOnMock(ns, required),
}))
const sendEvmMock = vi.fn()
vi.mock('@/wallet/send/evm', () => ({
  sendEvmTransaction: (...a: unknown[]) => sendEvmMock(...a),
}))
const sendSolanaMock = vi.fn()
vi.mock('@/wallet/send/solana', () => ({
  signAndSendSolanaTx: (...a: unknown[]) => sendSolanaMock(...a),
}))

// ensureAllowance moved to @tenda/shared: partial mock, spy only that leg.
const ensureAllowanceMock = vi.fn()
vi.mock('@tenda/shared', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tenda/shared')),
  ensureAllowance: (...a: unknown[]) => ensureAllowanceMock(...a),
}))

const modalState = { addresses: {} as Partial<Record<ChainNamespace, string>> }
vi.mock('@/wallet/runtime', () => ({
  peekWalletRuntime: () => ({
    modal: { getAddress: (ns: ChainNamespace) => modalState.addresses[ns] },
  }),
}))

const authState = { wallets: [] as LinkedWallet[] }
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => authState },
}))

const reportTxMock = vi.fn()
vi.mock('@/stores/escrow.store', () => ({
  useEscrowStore: { getState: () => ({ reportTx: reportTxMock }) },
}))

import {
  declaredSignerFor,
  resolveEvmFrom,
  resolveSignerFor,
  resolveSignersForChain,
  signAndSendUnsignedTx,
  signSendAndReport,
  UnsupportedUnsignedTxError,
} from '@/wallet/dispatch'
import { sendEvmTransaction } from '@/wallet/send/evm'

function linked(address: string, over: Partial<LinkedWallet> = {}): LinkedWallet {
  return { chain_ns: 'eip155', address, is_primary: false, verified_at: '2026-01-01T00:00:00Z', ...over }
}

const EVM_TX = { kind: 'evm-tx', to: '0xEscrow', data: '0xdead', value: '0' } satisfies UnsignedTx
const SOLANA_TX = {
  kind: 'solana-tx',
  tx_base64: 'AQID',
  recent_blockhash: 'hash',
  last_valid_block_height: 1,
} satisfies UnsignedTx

beforeEach(() => {
  modalState.addresses = {}
  authState.wallets = []
  ensureSessionOnMock.mockResolvedValue('0xLive')
  sendEvmMock.mockResolvedValue('0xhash')
  sendSolanaMock.mockResolvedValue('sol-sig')
  reportTxMock.mockResolvedValue({ status: 'queued' })
})

describe('signer resolution', () => {
  it('prefers the live modal address while it is a verified linked wallet', () => {
    modalState.addresses = { eip155: '0xLive' }
    authState.wallets = [linked('0xLive'), linked('0xPrimary', { is_primary: true })]
    expect(resolveEvmFrom()).toBe('0xLive')
  })

  it('ignores a stranger session and falls back to the primary linked wallet', () => {
    modalState.addresses = { eip155: '0xStranger' }
    authState.wallets = [linked('0xPrimary', { is_primary: true })]
    expect(resolveEvmFrom()).toBe('0xPrimary')
  })

  it('resolveSignerFor is namespace-scoped', () => {
    authState.wallets = [linked('SoL1', { chain_ns: 'solana', is_primary: true })]
    expect(resolveSignerFor('solana')).toBe('SoL1')
    expect(resolveSignerFor('eip155')).toBeNull()
  })

  it('resolveSignersForChain resolves the namespace via the manifest — unknown ids yield []', () => {
    authState.wallets = [linked('0xPrimary', { is_primary: true }), linked('0xSecond')]
    expect(resolveSignersForChain('eip155:84532')).toEqual(['0xPrimary', '0xSecond'])
    expect(resolveSignersForChain('made-up:1')).toEqual([])
  })

  it('declaredSignerFor: the dialog-row resolution, or NOTHING on unknown chain / empty registry', () => {
    // The coherence function of the signer contract: what it answers is what
    // the create body declares. A wrong fallback here would declare a wallet
    // the user never previewed.
    modalState.addresses = { eip155: '0xLive' }
    authState.wallets = [linked('0xLive'), linked('0xPrimary', { is_primary: true })]
    expect(declaredSignerFor('eip155:84532')).toBe('0xLive')
    authState.wallets = [linked('0xPrimary', { is_primary: true })]
    modalState.addresses = {}
    expect(declaredSignerFor('eip155:84532')).toBe('0xPrimary')
    expect(declaredSignerFor('made-up:1')).toBeUndefined()
    authState.wallets = []
    expect(declaredSignerFor('eip155:84532')).toBeUndefined()
  })
})

describe('solana-tx', () => {
  it('ensures a live LINKED session before signing', async () => {
    const order: string[] = []
    ensureSessionOnMock.mockImplementation(async (ns: ChainNamespace) => {
      order.push(`session:${ns}`)
      return 'SoL1'
    })
    sendSolanaMock.mockImplementation(async () => {
      order.push('sign')
      return 'sol-sig'
    })
    await expect(signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet')).resolves.toBe('sol-sig')
    expect(order).toEqual(['session:solana', 'sign'])
    expect(sendSolanaMock).toHaveBeenCalledWith('AQID', undefined)
  })

  it('a declined connect aborts before any signing', async () => {
    ensureSessionOnMock.mockRejectedValue(new Error('declined'))
    await expect(signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet')).rejects.toThrow('declined')
    expect(sendSolanaMock).not.toHaveBeenCalled()
  })

  it("the wire's signer_address pins the session to THAT wallet; absent = any linked", async () => {
    // Signer contract: the baked payer is the only wallet that can sign this
    // tx — the guard must be told to demand it. Dropping the passthrough in
    // dispatch fails this.
    await signAndSendUnsignedTx({ ...SOLANA_TX, signer_address: 'SoL9' }, 'solana:devnet')
    expect(ensureSessionOnMock).toHaveBeenLastCalledWith('solana', 'SoL9')
    await signAndSendUnsignedTx(SOLANA_TX, 'solana:devnet')
    expect(ensureSessionOnMock).toHaveBeenLastCalledWith('solana', undefined)
  })
})

describe('evm-tx', () => {
  beforeEach(() => {
    modalState.addresses = { eip155: '0xLive' }
    authState.wallets = [linked('0xLive', { is_primary: true })]
  })

  it('sends from the resolved signer with chain + feeCurrency passthrough', async () => {
    await expect(
      signAndSendUnsignedTx({ ...EVM_TX, fee_currency: '0xCUSD' }, 'eip155:42220'),
    ).resolves.toBe('0xhash')
    expect(sendEvmMock).toHaveBeenCalledWith({
      from: '0xLive',
      to: '0xEscrow',
      data: '0xdead',
      value: '0',
      chainId: 'eip155:42220',
      feeCurrency: '0xCUSD',
    })
  })

  it("the wire's signer_address is the FROM — the chain-bound sender beats the live session", async () => {
    // resolveEvmFrom would answer 0xLive here; the contract's party check
    // only accepts the bound wallet, so the wire wins. The guard is told to
    // demand it too (the session must BE that wallet before signing).
    await signAndSendUnsignedTx({ ...EVM_TX, signer_address: '0xBound' }, 'eip155:84532')
    expect(ensureSessionOnMock).toHaveBeenLastCalledWith('eip155', '0xBound')
    expect(sendEvmMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: '0xBound' }),
    )
  })

  it('ensures the allowance BEFORE broadcasting when the hint is present', async () => {
    const HINTED: UnsignedTx = {
      ...EVM_TX,
      approval: { token: '0xToken', spender: '0xEscrow', amount_raw: '1000000' },
    }
    const order: string[] = []
    ensureAllowanceMock.mockImplementation(async () => {
      order.push('allowance')
      return 'approved'
    })
    sendEvmMock.mockImplementation(async () => {
      order.push('send')
      return '0xhash'
    })
    await signAndSendUnsignedTx(HINTED, 'eip155:84532')
    expect(ensureAllowanceMock).toHaveBeenCalledWith({
      chainId: 'eip155:84532',
      token: '0xToken',
      spender: '0xEscrow',
      amountRaw: '1000000',
      owner: '0xLive',
      // The transport seam: dispatch binds ITS wallet sender into the shared
      // allowance module — the tx must ride the connected session, not RPC.
      sendTx: sendEvmTransaction,
    })
    expect(order).toEqual(['allowance', 'send'])
  })

  it('skips the allowance leg entirely when there is no hint (permit/native)', async () => {
    await signAndSendUnsignedTx(EVM_TX, 'eip155:84532')
    expect(ensureAllowanceMock).not.toHaveBeenCalled()
  })

  it('a failed approval aborts the flow, the escrow tx is never broadcast', async () => {
    const HINTED: UnsignedTx = {
      ...EVM_TX,
      approval: { token: '0xToken', spender: '0xEscrow', amount_raw: '1' },
    }
    ensureAllowanceMock.mockRejectedValue(new Error('approval reverted'))
    await expect(signAndSendUnsignedTx(HINTED, 'eip155:84532')).rejects.toThrow('approval reverted')
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('a hint without a chain_id throws loudly, never silently broadcast a doomed tx', async () => {
    const HINTED: UnsignedTx = {
      ...EVM_TX,
      approval: { token: '0xToken', spender: '0xEscrow', amount_raw: '1' },
    }
    await expect(signAndSendUnsignedTx(HINTED)).rejects.toBeInstanceOf(UnsupportedUnsignedTxError)
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('no resolvable signer after the session guard dead-ends with instructions', async () => {
    authState.wallets = [] // nothing linked
    await expect(signAndSendUnsignedTx(EVM_TX, 'eip155:84532')).rejects.toThrow(/link one in Settings/)
    expect(sendEvmMock).not.toHaveBeenCalled()
  })
})

describe('evm-userop', () => {
  it('throws the typed unsupported error (blocked on #47)', async () => {
    const USEROP: UnsignedTx = {
      kind: 'evm-userop',
      user_op: {
        sender: '0x0', nonce: '0', init_code: '0x', call_data: '0x',
        call_gas_limit: '0', verification_gas_limit: '0', pre_verification_gas: '0',
        max_fee_per_gas: '0', max_priority_fee_per_gas: '0',
        paymaster_and_data: '0x', signature: '0x',
      },
      entry_point: '0xEntry',
    }
    await expect(signAndSendUnsignedTx(USEROP, 'eip155:84532')).rejects.toBeInstanceOf(
      UnsupportedUnsignedTxError,
    )
  })
})

describe('signSendAndReport', () => {
  it('signs, then client-pings with the action + chain + escrow id', async () => {
    modalState.addresses = { eip155: '0xLive' }
    authState.wallets = [linked('0xLive', { is_primary: true })]
    await expect(
      signSendAndReport({ unsigned: EVM_TX, action: 'accept', chain_id: 'eip155:84532', escrow_id: 'e1' }),
    ).resolves.toBe('0xhash')
    expect(reportTxMock).toHaveBeenCalledWith({
      tx_ref: '0xhash',
      action: 'accept',
      chain_id: 'eip155:84532',
      escrow_id: 'e1',
    })
  })

  it('a signing failure never reaches the report leg', async () => {
    modalState.addresses = { eip155: '0xLive' }
    authState.wallets = [linked('0xLive', { is_primary: true })]
    sendEvmMock.mockRejectedValue(new Error('declined'))
    await expect(
      signSendAndReport({ unsigned: EVM_TX, action: 'accept', chain_id: 'eip155:84532' }),
    ).rejects.toThrow('declined')
    expect(reportTxMock).not.toHaveBeenCalled()
  })
})
