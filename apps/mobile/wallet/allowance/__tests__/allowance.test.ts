/**
 * wallet/allowance, pure encoders, the allowance read, and the
 * ensureAllowance composition (skip-if-sufficient / approve-then-wait /
 * revert-and-timeout failure modes). RPC rides mocked global fetch (same
 * pattern as balances/evm tests); the approve tx rides a mocked wallet
 * session.
 */
jest.mock('@/wallet/adapters/walletconnect', () => ({
  sendEvmTransaction: jest.fn(),
}))

import { sendEvmTransaction } from '@/wallet/adapters/walletconnect'
import {
  displayToAmountRaw,
  encodeApprove,
  ensureAllowance,
  readAllowance,
  waitForReceipt,
} from '@/wallet/allowance'

const sendEvmMock = sendEvmTransaction as jest.Mock
const fetchMock = jest.fn()

const CHAIN = 'eip155:84532' // manifest publicRpcUrl exists for this id
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const OWNER = '0xAbC0000000000000000000000000000000000001'
const SPENDER = '0xDef0000000000000000000000000000000000002'

function rpcResult(result: unknown) {
  return { json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
}

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset()
  sendEvmMock.mockReset()
})

describe('pure encoders', () => {
  it('encodeApprove: selector + padded spender + padded amount', () => {
    const data = encodeApprove(SPENDER, '1000000')
    expect(data).toBe(
      '0x095ea7b3' +
        'def0000000000000000000000000000000000002'.padStart(64, '0') +
        (1_000_000).toString(16).padStart(64, '0'),
    )
  })

  it('displayToAmountRaw: decimal strings → base units; junk → null', () => {
    expect(displayToAmountRaw('12.5', 6)).toBe('12500000')
    expect(displayToAmountRaw('0', 6)).toBe('0')
    expect(displayToAmountRaw('45', 6)).toBe('45000000')
    expect(displayToAmountRaw('0.000001', 6)).toBe('1')
    expect(displayToAmountRaw('0.0000001', 6)).toBeNull() // beyond precision
    expect(displayToAmountRaw('12.', 6)).toBeNull()
    expect(displayToAmountRaw('-5', 6)).toBeNull()
    expect(displayToAmountRaw('abc', 6)).toBeNull()
    expect(displayToAmountRaw('', 6)).toBeNull()
  })

  it('displayToAmountRaw: caps at uint256 (padStart cannot truncate the excess)', () => {
    const maxUint256 = 2n ** 256n - 1n
    expect(displayToAmountRaw(maxUint256.toString(), 0)).toBe(maxUint256.toString())
    expect(displayToAmountRaw((maxUint256 + 1n).toString(), 0)).toBeNull()
    expect(displayToAmountRaw(maxUint256.toString(), 6)).toBeNull() // ×10^6 overflows
  })

  it('encodeApprove: an over-uint256 amount throws instead of emitting malformed calldata', () => {
    expect(() => encodeApprove(SPENDER, (2n ** 256n).toString())).toThrow(RangeError)
  })
})

describe('readAllowance', () => {
  it('eth_calls allowance(owner, spender) and decodes the hex quantity', async () => {
    fetchMock.mockResolvedValue(rpcResult(`0x${(5_000_000).toString(16)}`))
    const allowance = await readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER })
    expect(allowance).toBe('5000000')
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)
    expect(body.method).toBe('eth_call')
    expect(body.params[0].to).toBe(TOKEN)
    expect(body.params[0].data.startsWith('0xdd62ed3e')).toBe(true)
  })

  it('a dead RPC propagates (callers surface it, never fake a zero allowance)', async () => {
    fetchMock.mockRejectedValue(new Error('rpc down'))
    await expect(
      readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    ).rejects.toThrow('rpc down')
  })

  it('a JSON-RPC error object throws too, an unreadable allowance is never zero', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }),
    })
    await expect(
      readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    ).rejects.toThrow('Could not read the current allowance')
  })

  it('an empty eth_call return (0x, no contract code) throws, not zero', async () => {
    fetchMock.mockResolvedValue(rpcResult('0x'))
    await expect(
      readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    ).rejects.toThrow('Could not read the current allowance')
  })

  it('unknown chain (no public RPC) throws the typed wallet error', async () => {
    await expect(
      readAllowance({ chainId: 'eip155:1', token: TOKEN, owner: OWNER, spender: SPENDER }),
    ).rejects.toThrow('No public RPC')
  })
})

describe('ensureAllowance', () => {
  it('sufficient standing allowance → no wallet round-trip', async () => {
    fetchMock.mockResolvedValue(rpcResult(`0x${(2_000_000).toString(16)}`))
    const result = await ensureAllowance({
      chainId: CHAIN,
      token: TOKEN,
      spender: SPENDER,
      amountRaw: '1000000',
      owner: OWNER,
    })
    expect(result).toBe('sufficient')
    expect(sendEvmMock).not.toHaveBeenCalled()
  })

  it('short allowance → approve via the wallet, then wait for the receipt', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult('0x0')) // allowance read
      .mockResolvedValueOnce(rpcResult({ status: '0x1' })) // receipt
    sendEvmMock.mockResolvedValue('0xApproveTx')

    const result = await ensureAllowance({
      chainId: CHAIN,
      token: TOKEN,
      spender: SPENDER,
      amountRaw: '1000000',
      owner: OWNER,
    })
    expect(result).toBe('approved')
    expect(sendEvmMock).toHaveBeenCalledWith({
      from: OWNER,
      to: TOKEN,
      data: encodeApprove(SPENDER, '1000000'),
      value: '0',
      chainId: CHAIN,
    })
  })

  it('a reverted approve tx throws (the escrow tx must never follow)', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult('0x0'))
      .mockResolvedValueOnce(rpcResult({ status: '0x0' }))
    sendEvmMock.mockResolvedValue('0xApproveTx')
    await expect(
      ensureAllowance({
        chainId: CHAIN,
        token: TOKEN,
        spender: SPENDER,
        amountRaw: '1',
        owner: OWNER,
        intervalMs: 1,
        timeoutMs: 100,
      }),
    ).rejects.toThrow('reverted')
  })

  it('a timed-out receipt re-checks the allowance before failing', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult('0x0')) // pre-check
      .mockResolvedValueOnce(rpcResult(null)) // receipt: still pending
      .mockResolvedValueOnce(rpcResult(`0x${(1_000_000).toString(16)}`)) // post-check: landed
    sendEvmMock.mockResolvedValue('0xApproveTx')
    const result = await ensureAllowance({
      chainId: CHAIN,
      token: TOKEN,
      spender: SPENDER,
      amountRaw: '1000000',
      owner: OWNER,
      intervalMs: 1,
      timeoutMs: 0, // force the timeout branch → post-check saves it
    })
    expect(result).toBe('approved')
  })

  it('timeout with the allowance still short throws the retry error', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult('0x0')) // pre-check
      .mockResolvedValueOnce(rpcResult(null)) // receipt: pending
      .mockResolvedValueOnce(rpcResult('0x0')) // post-check: still short
    sendEvmMock.mockResolvedValue('0xApproveTx')
    await expect(
      ensureAllowance({
        chainId: CHAIN,
        token: TOKEN,
        spender: SPENDER,
        amountRaw: '1000000',
        owner: OWNER,
        intervalMs: 1,
        timeoutMs: 0,
      }),
    ).rejects.toThrow('taking too long')
  })
})

describe('waitForReceipt', () => {
  it('polls until mined; reports revert and timeout distinctly', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(null))
      .mockResolvedValueOnce(rpcResult({ status: '0x1' }))
    const confirmed = await waitForReceipt({ chainId: CHAIN, txHash: '0xA', intervalMs: 1, timeoutMs: 5_000 })
    expect(confirmed).toBe('confirmed')

    fetchMock.mockResolvedValue(rpcResult({ status: '0x0' }))
    expect(await waitForReceipt({ chainId: CHAIN, txHash: '0xB', intervalMs: 1 })).toBe('reverted')

    fetchMock.mockResolvedValue(rpcResult(null))
    expect(await waitForReceipt({ chainId: CHAIN, txHash: '0xC', intervalMs: 1, timeoutMs: 5 })).toBe('timeout')
  })
})
