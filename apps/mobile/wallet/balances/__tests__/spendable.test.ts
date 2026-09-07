/**
 * readSpendableBalance — "what could ONE transaction actually move", across
 * every wallet that might sign it.
 *
 * Two properties carry the whole design:
 *  - MAX, never SUM. Balances don't combine across wallets; a transaction is
 *    signed by exactly one. Summing would tell a user they can fund something
 *    they can't. (The wallet screen sums on purpose — it answers "what do I
 *    own", a different question.)
 *  - Any unreadable wallet ⇒ UNKNOWN (null), never a partial maximum, because
 *    under-reporting the maximum is what tells a funded user they're broke.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

const mockReadAssetBalance = jest.fn()
jest.mock('@/wallet/balances/read-asset', () => ({
  readAssetBalance: (...a: unknown[]) => mockReadAssetBalance(...a),
}))

import { readSpendableBalance } from '@/wallet/balances/spendable'

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}

function balance(amountRaw: string) {
  return { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw, decimals: 6, isStable: true }
}

beforeEach(() => mockReadAssetBalance.mockReset())

test('one wallet: its balance is the spendable amount', async () => {
  mockReadAssetBalance.mockResolvedValue(balance('48500000'))

  const out = await readSpendableBalance(['0xa'], CHAIN, 'USDC_BASE')

  expect(out?.amountRaw).toBe('48500000')
  expect(mockReadAssetBalance).toHaveBeenCalledWith('0xa', CHAIN, 'USDC_BASE')
})

test('takes the MAX across wallets, never the sum', async () => {
  mockReadAssetBalance
    .mockResolvedValueOnce(balance('30000000'))
    .mockResolvedValueOnce(balance('50000000'))

  const out = await readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')

  // Sum would be 80 — a number no single transaction could ever spend.
  expect(out?.amountRaw).toBe('50000000')
})

test('the max wins regardless of wallet order', async () => {
  mockReadAssetBalance
    .mockResolvedValueOnce(balance('50000000'))
    .mockResolvedValueOnce(balance('30000000'))

  const out = await readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')

  expect(out?.amountRaw).toBe('50000000')
})

test('compares 18-decimal balances exactly when picking the max', async () => {
  // Both beyond Number.MAX_SAFE_INTEGER, one base unit apart — a float compare
  // would treat them as equal and could return the smaller one.
  mockReadAssetBalance
    .mockResolvedValueOnce(balance('1000000000000000000'))
    .mockResolvedValueOnce(balance('1000000000000000001'))

  const out = await readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')

  expect(out?.amountRaw).toBe('1000000000000000001')
})

test('reads every candidate wallet', async () => {
  mockReadAssetBalance.mockResolvedValue(balance('1'))

  await readSpendableBalance(['0xa', '0xb', '0xc'], CHAIN, 'USDC_BASE')

  expect(mockReadAssetBalance).toHaveBeenCalledTimes(3)
})

test('no wallets is UNKNOWN, and reads nothing', async () => {
  expect(await readSpendableBalance([], CHAIN, 'USDC_BASE')).toBeNull()
  expect(mockReadAssetBalance).not.toHaveBeenCalled()
})

test('one unreadable wallet makes the maximum UNKNOWN, not a partial max', async () => {
  // 0xb might hold plenty; reporting 30 as the max could block a funded user.
  mockReadAssetBalance
    .mockResolvedValueOnce(balance('30000000'))
    .mockResolvedValueOnce(null)

  expect(await readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')).toBeNull()
})

test('a rejecting read makes the maximum UNKNOWN rather than propagating', async () => {
  mockReadAssetBalance
    .mockResolvedValueOnce(balance('30000000'))
    .mockRejectedValueOnce(new Error('rpc down'))

  await expect(readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')).resolves.toBeNull()
})

test('an unparseable reading makes the maximum UNKNOWN', async () => {
  mockReadAssetBalance.mockResolvedValue(balance('not-a-number'))

  expect(await readSpendableBalance(['0xa'], CHAIN, 'USDC_BASE')).toBeNull()
})

test('all-zero wallets is a real zero, not unknown', async () => {
  mockReadAssetBalance.mockResolvedValue(balance('0'))

  const out = await readSpendableBalance(['0xa', '0xb'], CHAIN, 'USDC_BASE')

  expect(out).not.toBeNull()
  expect(out?.amountRaw).toBe('0')
})
