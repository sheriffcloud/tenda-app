/**
 * ensureSufficientBalance — the pre-flight that stops a transaction the signer
 * demonstrably can't fund. The load-bearing property is FAIL-OPEN: every path
 * that can't positively read a short balance must resolve, because blocking a
 * funded user is worse than letting the chain revert an underfunded one.
 * Covers the equal boundary, BigInt exactness past 2^53, and each unknown.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

const mockReadSpendable = jest.fn()
jest.mock('@/wallet/balances/spendable', () => ({
  readSpendableBalance: (...a: unknown[]) => mockReadSpendable(...a),
}))

const mockGetState = jest.fn()
jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: { getState: () => mockGetState() },
  selectChainById: (chains: ChainRegistryEntry[] | null, id: string) =>
    chains?.find((c) => c.id === id) ?? null,
}))

import {
  ensureSufficientBalance,
  InsufficientBalanceError,
  SUFFICIENCY_TIMEOUT_MS,
} from '@/wallet/balances/sufficiency'

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}

const OWNER = '0xabc'
const ARGS = { chainId: CHAIN.id, assetId: 'USDC_BASE', amountRaw: '10000000', owners: [OWNER] }

/** A balance reading of `amountRaw` base units of the escrow asset. */
function balance(amountRaw: string) {
  return { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw, decimals: 6, isStable: true }
}

beforeEach(() => {
  mockReadSpendable.mockReset()
  mockGetState.mockReset().mockReturnValue({ chains: [CHAIN] })
})

// --- the check does its job -------------------------------------------------

test('throws when the wallet holds less than the transaction debits', async () => {
  mockReadSpendable.mockResolvedValue(balance('9999999'))

  await expect(ensureSufficientBalance(ARGS)).rejects.toBeInstanceOf(InsufficientBalanceError)
})

test('the error carries the exact shortfall in base units and reads in the asset', async () => {
  mockReadSpendable.mockResolvedValue(balance('2500000'))

  const err = await ensureSufficientBalance(ARGS).catch((e: unknown) => e)

  expect(err).toBeInstanceOf(InsufficientBalanceError)
  const insufficient = err as InsufficientBalanceError
  expect(insufficient.requiredRaw).toBe('10000000')
  expect(insufficient.availableRaw).toBe('2500000')
  expect(insufficient.assetId).toBe('USDC_BASE')
  expect(insufficient.code).toBe('insufficient_balance')
  // Formatted through the shared helper — base units never reach the user.
  expect(insufficient.message).toContain('10 USDC')
  expect(insufficient.message).toContain('2.5 USDC')
})

test('a zero balance is short, and is reported', async () => {
  mockReadSpendable.mockResolvedValue(balance('0'))

  await expect(ensureSufficientBalance(ARGS)).rejects.toBeInstanceOf(InsufficientBalanceError)
})

test('passes when the wallet holds more than enough', async () => {
  mockReadSpendable.mockResolvedValue(balance('50000000'))

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
})

test('exactly enough passes — an off-by-one here blocks fully-funded users', async () => {
  mockReadSpendable.mockResolvedValue(balance('10000000'))

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
})

test('one base unit short is short', async () => {
  mockReadSpendable.mockResolvedValue(balance('9999999'))

  await expect(ensureSufficientBalance(ARGS)).rejects.toBeInstanceOf(InsufficientBalanceError)
})

// --- BigInt exactness -------------------------------------------------------

test('compares 18-decimal amounts exactly past Number.MAX_SAFE_INTEGER', async () => {
  // 1 ETH = 1e18; both operands are ~111x MAX_SAFE_INTEGER, and they differ by
  // a single base unit. Number arithmetic rounds both to the same float and
  // would wrongly pass.
  const required = '1000000000000000001'
  const available = '1000000000000000000'
  expect(Number(required)).toBe(Number(available)) // the precision trap, made explicit
  mockReadSpendable.mockResolvedValue(balance(available))

  await expect(
    ensureSufficientBalance({ ...ARGS, amountRaw: required }),
  ).rejects.toBeInstanceOf(InsufficientBalanceError)
})

test('a huge sufficient balance still passes (no float overflow false-positive)', async () => {
  mockReadSpendable.mockResolvedValue(balance('9000000000000000000'))

  await expect(
    ensureSufficientBalance({ ...ARGS, amountRaw: '1000000000000000000' }),
  ).resolves.toBeUndefined()
})

// --- fail-open: unknown is never "insufficient" -----------------------------

test('falls open when the balance cannot be read (RPC failure → null)', async () => {
  mockReadSpendable.mockResolvedValue(null)

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
})

test('falls open when the read rejects', async () => {
  mockReadSpendable.mockRejectedValue(new Error('rpc exploded'))

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
})

test('falls open when the read hangs past the pre-flight budget', async () => {
  jest.useFakeTimers()
  try {
    mockReadSpendable.mockReturnValue(new Promise(() => {})) // never settles
    const pending = ensureSufficientBalance(ARGS)
    jest.advanceTimersByTime(SUFFICIENCY_TIMEOUT_MS + 1)
    await expect(pending).resolves.toBeUndefined()
  } finally {
    jest.useRealTimers()
  }
})

test('the pre-flight budget is tighter than a reader RPC timeout', async () => {
  // It blocks a flow that is otherwise instant, so it must surrender first.
  const { BALANCE_RPC_TIMEOUT_MS } = jest.requireActual<{ BALANCE_RPC_TIMEOUT_MS: number }>(
    '@/wallet/balances/constants',
  )
  expect(SUFFICIENCY_TIMEOUT_MS).toBeLessThan(BALANCE_RPC_TIMEOUT_MS)
})

test('falls open when there is no linked wallet (the 9D gate owns that case)', async () => {
  await expect(ensureSufficientBalance({ ...ARGS, owners: [] })).resolves.toBeUndefined()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('falls open when the registry has not loaded', async () => {
  mockGetState.mockReturnValue({ chains: null })

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('falls open when the chain is not in the registry', async () => {
  await expect(
    ensureSufficientBalance({ ...ARGS, chainId: 'eip155:999999' }),
  ).resolves.toBeUndefined()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('falls open on a malformed required amount rather than throwing', async () => {
  await expect(ensureSufficientBalance({ ...ARGS, amountRaw: 'not-a-number' })).resolves.toBeUndefined()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('falls open on a malformed balance reading', async () => {
  mockReadSpendable.mockResolvedValue(balance('12.5')) // base units are integers

  await expect(ensureSufficientBalance(ARGS)).resolves.toBeUndefined()
})

test('a zero-value transaction never reads the chain', async () => {
  await expect(ensureSufficientBalance({ ...ARGS, amountRaw: '0' })).resolves.toBeUndefined()
  expect(mockReadSpendable).not.toHaveBeenCalled()
})

test('reads the spendable balance across every candidate wallet', async () => {
  mockReadSpendable.mockResolvedValue(balance('50000000'))

  await ensureSufficientBalance({ ...ARGS, owners: [OWNER, '0xsecond'] })

  expect(mockReadSpendable).toHaveBeenCalledWith([OWNER, '0xsecond'], CHAIN, 'USDC_BASE')
})

test('does NOT block when a second linked wallet can cover it', async () => {
  // The primary holds 0 but the other wallet holds 50; readSpendableBalance
  // reports the MAX, because the user may sign with either. Blocking here would
  // contradict the wallet screen, which shows the money.
  mockReadSpendable.mockResolvedValue(balance('50000000'))

  await expect(
    ensureSufficientBalance({ ...ARGS, owners: ['0xprimary', '0xfunded'] }),
  ).resolves.toBeUndefined()
})

test('blocks only when NO linked wallet can cover it', async () => {
  mockReadSpendable.mockResolvedValue(balance('1000000')) // best of both, still short

  await expect(
    ensureSufficientBalance({ ...ARGS, owners: ['0xprimary', '0xother'] }),
  ).rejects.toBeInstanceOf(InsufficientBalanceError)
})

test('the error reports the BEST wallet balance, not the primary’s', async () => {
  mockReadSpendable.mockResolvedValue(balance('2500000'))

  const err = await ensureSufficientBalance({ ...ARGS, owners: ['0xa', '0xb'] }).catch((e: unknown) => e)

  expect((err as InsufficientBalanceError).availableRaw).toBe('2500000')
})
