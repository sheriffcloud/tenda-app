/**
 * The transaction pre-flight trio: readAssetBalance (targeted single-asset
 * read), readSpendableBalance (MAX across signers, unknown-is-never-zero),
 * and ensureSufficientBalanceOn (FAIL-OPEN sufficiency). Readers ride the
 * injected registry — no fetch, no mocks of sibling modules.
 */
import { test, mock } from 'node:test'
import assert from 'node:assert'
import type { ChainNamespace } from '../../src/db/schema/chains'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'
import type { AssetBalance, BalanceReader } from '../../src/wallet/balances/types'
import { readAssetBalance } from '../../src/wallet/balances/read-asset'
import { readSpendableBalance } from '../../src/wallet/balances/spendable'
import {
  ensureSufficientBalanceOn,
  InsufficientBalanceError,
  SUFFICIENCY_TIMEOUT_MS,
} from '../../src/wallet/balances/sufficiency'
import { BALANCE_RPC_TIMEOUT_MS } from '../../src/wallet/balances/constants'

const EVM_CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}
const SOL_CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'PROGRAM',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false },
  ],
}

function balance(amountRaw: string, assetId = 'USDC_BASE'): AssetBalance {
  return { assetId, symbol: 'USDC', amountRaw, decimals: 6, isStable: true }
}

interface ReaderCall {
  ns: ChainNamespace
  address: string
  assetIds: readonly string[] | undefined
}

/**
 * A reader registry answering per-address from `byAddress`; missing address =
 * empty read; the sentinel Error rejects. Records every call.
 */
function fakeReaders(byAddress: Record<string, AssetBalance[] | Error>) {
  const calls: ReaderCall[] = []
  const reader = (ns: ChainNamespace): BalanceReader => ({
    read: async (address, _chain, assetIds) => {
      calls.push({ ns, address, assetIds })
      const entry = byAddress[address]
      if (entry instanceof Error) throw entry
      return entry ?? []
    },
  })
  return { calls, readers: { solana: reader('solana'), eip155: reader('eip155') } }
}

// ---------- readAssetBalance ----------

test('readAssetBalance routes to the namespace reader with the single-asset filter', async () => {
  const { calls, readers } = fakeReaders({ '0xabc': [balance('48500000')] })
  const out = await readAssetBalance('0xabc', EVM_CHAIN, 'USDC_BASE', readers)
  assert.deepStrictEqual(out, balance('48500000'))
  assert.deepStrictEqual(calls, [{ ns: 'eip155', address: '0xabc', assetIds: ['USDC_BASE'] }])
})

test('a Solana chain routes to the Solana reader', async () => {
  const { calls, readers } = fakeReaders({ SoL: [balance('1', 'USDC_SOL')] })
  const out = await readAssetBalance('SoL', SOL_CHAIN, 'USDC_SOL', readers)
  assert.strictEqual(out?.assetId, 'USDC_SOL')
  assert.strictEqual(calls[0].ns, 'solana')
})

test('an empty read answers null — UNKNOWN, never zero', async () => {
  const { readers } = fakeReaders({ '0xabc': [] })
  assert.strictEqual(await readAssetBalance('0xabc', EVM_CHAIN, 'USDC_BASE', readers), null)
})

test('a read that returns OTHER assets still answers null for the one asked for', async () => {
  const { readers } = fakeReaders({ '0xabc': [balance('5', 'SOMETHING_ELSE')] })
  assert.strictEqual(await readAssetBalance('0xabc', EVM_CHAIN, 'USDC_BASE', readers), null)
})

// ---------- readSpendableBalance ----------

test('takes the MAX across wallets, never the sum, regardless of order', async () => {
  const { readers } = fakeReaders({ '0xa': [balance('30000000')], '0xb': [balance('50000000')] })
  // Sum would be 80 — a number no single transaction could ever spend.
  assert.strictEqual(
    (await readSpendableBalance(['0xa', '0xb'], EVM_CHAIN, 'USDC_BASE', readers))?.amountRaw,
    '50000000',
  )
  assert.strictEqual(
    (await readSpendableBalance(['0xb', '0xa'], EVM_CHAIN, 'USDC_BASE', readers))?.amountRaw,
    '50000000',
  )
})

test('compares 18-decimal balances exactly when picking the max', async () => {
  // Both beyond Number.MAX_SAFE_INTEGER, one base unit apart — a float compare
  // would treat them as equal and could return the smaller one.
  const { readers } = fakeReaders({
    '0xa': [balance('1000000000000000000')],
    '0xb': [balance('1000000000000000001')],
  })
  assert.strictEqual(
    (await readSpendableBalance(['0xa', '0xb'], EVM_CHAIN, 'USDC_BASE', readers))?.amountRaw,
    '1000000000000000001',
  )
})

test('no wallets is UNKNOWN, and reads nothing', async () => {
  const { calls, readers } = fakeReaders({})
  assert.strictEqual(await readSpendableBalance([], EVM_CHAIN, 'USDC_BASE', readers), null)
  assert.strictEqual(calls.length, 0)
})

test('one unreadable wallet makes the maximum UNKNOWN, not a partial max', async () => {
  // 0xb might hold plenty; reporting 30 as the max could block a funded user.
  const { readers } = fakeReaders({ '0xa': [balance('30000000')] }) // 0xb reads empty
  assert.strictEqual(await readSpendableBalance(['0xa', '0xb'], EVM_CHAIN, 'USDC_BASE', readers), null)
})

test('a rejecting read makes the maximum UNKNOWN rather than propagating', async () => {
  const { readers } = fakeReaders({ '0xa': [balance('30000000')], '0xb': new Error('rpc down') })
  assert.strictEqual(await readSpendableBalance(['0xa', '0xb'], EVM_CHAIN, 'USDC_BASE', readers), null)
})

test('an unparseable reading makes the maximum UNKNOWN', async () => {
  const { readers } = fakeReaders({ '0xa': [balance('not-a-number')] })
  assert.strictEqual(await readSpendableBalance(['0xa'], EVM_CHAIN, 'USDC_BASE', readers), null)
})

test('all-zero wallets is a real zero, not unknown', async () => {
  const { readers } = fakeReaders({ '0xa': [balance('0')], '0xb': [balance('0')] })
  const out = await readSpendableBalance(['0xa', '0xb'], EVM_CHAIN, 'USDC_BASE', readers)
  assert.strictEqual(out?.amountRaw, '0')
})

// ---------- ensureSufficientBalanceOn ----------

const ARGS = { assetId: 'USDC_BASE', amountRaw: '10000000', owners: ['0xabc'] }

test('throws when the wallet holds less than the transaction debits, with exact figures', async () => {
  const { readers } = fakeReaders({ '0xabc': [balance('2500000')] })
  const err = await ensureSufficientBalanceOn(EVM_CHAIN, ARGS, readers).catch((e: unknown) => e)
  assert.ok(err instanceof InsufficientBalanceError)
  assert.strictEqual(err.requiredRaw, '10000000')
  assert.strictEqual(err.availableRaw, '2500000')
  assert.strictEqual(err.assetId, 'USDC_BASE')
  assert.strictEqual(err.code, 'insufficient_balance')
  // Formatted through the shared helper — base units never reach the user.
  assert.ok(err.message.includes('10 USDC'))
  assert.ok(err.message.includes('2.5 USDC'))
})

test('a zero balance is short; exactly enough passes; one unit short is short', async () => {
  const zero = fakeReaders({ '0xabc': [balance('0')] })
  await assert.rejects(ensureSufficientBalanceOn(EVM_CHAIN, ARGS, zero.readers), InsufficientBalanceError)

  const exact = fakeReaders({ '0xabc': [balance('10000000')] })
  await ensureSufficientBalanceOn(EVM_CHAIN, ARGS, exact.readers)

  const short = fakeReaders({ '0xabc': [balance('9999999')] })
  await assert.rejects(ensureSufficientBalanceOn(EVM_CHAIN, ARGS, short.readers), InsufficientBalanceError)
})

test('compares 18-decimal amounts exactly past Number.MAX_SAFE_INTEGER', async () => {
  const required = '1000000000000000001'
  const available = '1000000000000000000'
  assert.strictEqual(Number(required), Number(available)) // the precision trap, made explicit
  const { readers } = fakeReaders({ '0xabc': [balance(available)] })
  await assert.rejects(
    ensureSufficientBalanceOn(EVM_CHAIN, { ...ARGS, amountRaw: required }, readers),
    InsufficientBalanceError,
  )
})

test('falls open when the balance cannot be read (null / reject)', async () => {
  const unknown = fakeReaders({}) // empty read → null
  await ensureSufficientBalanceOn(EVM_CHAIN, ARGS, unknown.readers)

  const rejecting = fakeReaders({ '0xabc': new Error('rpc exploded') })
  await ensureSufficientBalanceOn(EVM_CHAIN, ARGS, rejecting.readers)
})

test('falls open when the read hangs past the pre-flight budget', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const hanging: Record<ChainNamespace, BalanceReader> = {
      solana: { read: () => new Promise(() => {}) },
      eip155: { read: () => new Promise(() => {}) },
    }
    const pending = ensureSufficientBalanceOn(EVM_CHAIN, ARGS, hanging)
    mock.timers.tick(SUFFICIENCY_TIMEOUT_MS + 1)
    await pending
  } finally {
    mock.timers.reset()
  }
})

test('the pre-flight budget is tighter than a reader RPC timeout', () => {
  // It blocks a flow that is otherwise instant, so it must surrender first.
  assert.ok(SUFFICIENCY_TIMEOUT_MS < BALANCE_RPC_TIMEOUT_MS)
})

test('falls open with no owners, a null chain, a malformed amount, or zero value — reading nothing', async () => {
  const { calls, readers } = fakeReaders({ '0xabc': [balance('50000000')] })
  await ensureSufficientBalanceOn(EVM_CHAIN, { ...ARGS, owners: [] }, readers)
  await ensureSufficientBalanceOn(null, ARGS, readers)
  await ensureSufficientBalanceOn(EVM_CHAIN, { ...ARGS, amountRaw: 'not-a-number' }, readers)
  await ensureSufficientBalanceOn(EVM_CHAIN, { ...ARGS, amountRaw: '0' }, readers)
  assert.strictEqual(calls.length, 0)
})

test('falls open on a malformed balance reading', async () => {
  const { readers } = fakeReaders({ '0xabc': [balance('12.5')] }) // base units are integers
  await ensureSufficientBalanceOn(EVM_CHAIN, ARGS, readers)
})

test('does NOT block when a second linked wallet can cover it; blocks only when none can', async () => {
  // The primary holds 0 but the other wallet holds 50 — the MAX is what the
  // user could sign with. Blocking would contradict the wallet screen.
  const covered = fakeReaders({ '0xprimary': [balance('0')], '0xfunded': [balance('50000000')] })
  await ensureSufficientBalanceOn(EVM_CHAIN, { ...ARGS, owners: ['0xprimary', '0xfunded'] }, covered.readers)

  const allShort = fakeReaders({ '0xprimary': [balance('1000000')], '0xother': [balance('500000')] })
  const err = await ensureSufficientBalanceOn(
    EVM_CHAIN,
    { ...ARGS, owners: ['0xprimary', '0xother'] },
    allShort.readers,
  ).catch((e: unknown) => e)
  assert.ok(err instanceof InsufficientBalanceError)
  // The error reports the BEST wallet balance, not the primary's.
  assert.strictEqual(err.availableRaw, '1000000')
})
