/**
 * `displayWalletAddress` — WHICH wallet represents a user in the UI (#42).
 *
 * The rule exists because the main-wallet marker became per chain family, so a
 * user can hold several at once. Two mobile surfaces picked with
 * `wallets.find(w => w.is_primary)` and would then name a different wallet as
 * "yours" depending on the order the list arrived in — on the drawer and the
 * profile header, which sit one tap apart.
 *
 * Stability is therefore the property under test, not the particular winner.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayWalletAddress } from '../../src/wallet/wallet-address'
import type { LinkedWallet } from '../../src/api/contracts/auth.contract'

function wallet(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'solana',
    address: 'Sol1',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as LinkedWallet
}

const SOL_MAIN = wallet({ chain_ns: 'solana', address: 'SolMain', is_primary: true })
const EVM_MAIN = wallet({ chain_ns: 'eip155', address: '0xEvmMain', is_primary: true })

test('two main wallets give the SAME answer whichever order they arrive in', () => {
  // The defect, exactly: `find` returns the first primary, so the handle
  // flipped with the list order. Nothing else in the app would notice.
  const forwards = displayWalletAddress([SOL_MAIN, EVM_MAIN])
  const backwards = displayWalletAddress([EVM_MAIN, SOL_MAIN])
  assert.equal(forwards, backwards)
  assert.equal(forwards, '0xEvmMain', 'chain_ns order decides, and eip155 sorts first')
})

test('a main wallet outranks a non-main one, whatever the order', () => {
  const other = wallet({ chain_ns: 'eip155', address: '0xAnother', is_primary: false })
  assert.equal(displayWalletAddress([other, SOL_MAIN]), 'SolMain')
  assert.equal(displayWalletAddress([SOL_MAIN, other]), 'SolMain')
})

test('with no main wallet at all it still answers, stably', () => {
  // A user who has linked wallets but never chosen a main one for any family —
  // the ordinary state right after linking, since link-wallet inserts
  // `is_primary: false`.
  const a = wallet({ chain_ns: 'eip155', address: '0xAaa' })
  const b = wallet({ chain_ns: 'eip155', address: '0xBbb' })
  assert.equal(displayWalletAddress([b, a]), '0xAaa')
  assert.equal(displayWalletAddress([a, b]), '0xAaa')
})

test('two wallets on ONE chain with no main are ordered by address, not by arrival', () => {
  // chain_ns alone is not a total order once a family holds several wallets;
  // without the address tiebreak this would still depend on the input order.
  const a = wallet({ chain_ns: 'solana', address: 'AAA' })
  const z = wallet({ chain_ns: 'solana', address: 'ZZZ' })
  assert.equal(displayWalletAddress([z, a]), 'AAA')
  assert.equal(displayWalletAddress([a, z]), 'AAA')
})

test('no wallets at all falls back to the connected session address', () => {
  assert.equal(displayWalletAddress([], '0xSession'), '0xSession')
})

test('no wallets and no fallback is null, not undefined or a crash', () => {
  // The callers render `truncateWallet(x)` behind a null check; undefined would
  // slip past `?? sessionWallet` in one of them and through to the formatter.
  assert.equal(displayWalletAddress([]), null)
})

test('the input array is not mutated — callers pass store state directly', () => {
  // Both call sites hand this the array straight out of a zustand store. An
  // in-place sort would reorder that state for every other reader of it.
  const input = [SOL_MAIN, EVM_MAIN]
  displayWalletAddress(input)
  assert.deepEqual(
    input.map((w) => w.address),
    ['SolMain', '0xEvmMain'],
  )
})
