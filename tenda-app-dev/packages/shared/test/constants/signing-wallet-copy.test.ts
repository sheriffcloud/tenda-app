/**
 * The signer sentences.
 *
 * This is the ONE place a reader is told which wallet is about to open, and
 * the refusals are the half that has to be actionable: "not linked" on its own
 * leaves them with nothing to do, so every message NAMES what would work.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import type { LinkedWallet } from '../../src/api/contracts/auth.contract'
import {
  BOUND_WALLET_LABEL,
  BOUND_WALLET_REFUSAL,
  SIGNING_WALLET_COPY,
  unlinkedWalletMessage,
} from '../../src/constants/signing-wallet-copy'

function w(over: Partial<LinkedWallet> = {}): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xAaaaBBBBcccc',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

test('the preview reads as one sentence around the address', () => {
  assert.strictEqual(
    `${SIGNING_WALLET_COPY.prefix} 0xAa…cccc ${SIGNING_WALLET_COPY.chainSuffix('Base Sepolia')}`,
    'Signing with 0xAa…cccc on Base Sepolia',
  )
})

test('the free and bound affordances are DIFFERENT words', () => {
  // "Switch" on a bound transition would promise a choice the chain does not
  // allow, which is the whole reason the two are separate strings.
  assert.notStrictEqual(SIGNING_WALLET_COPY.switchAction, SIGNING_WALLET_COPY.connectAction)
})

test('the stranger refusal NAMES the wallets that would have worked', () => {
  const message = unlinkedWalletMessage('eip155', [
    w({ address: '0xAaaaBBBBcccc' }),
    w({ address: '0xDDDDeeeeFFFF' }),
  ])
  assert.match(message, /\(0xAa…cccc, 0xDD…FFFF\)/)
})

test('it drops the empty parenthesis when there is nothing to name', () => {
  assert.strictEqual(
    unlinkedWalletMessage('eip155', []),
    'Connect one of your linked wallets to sign this transaction',
  )
})

test('it names only the namespace asked about, and only verified wallets', () => {
  // Naming a Solana wallet to someone stuck on an EVM escrow is worse than
  // naming none — it sends them to a wallet that cannot sign it either.
  const message = unlinkedWalletMessage('eip155', [
    w({ chain_ns: 'solana', address: 'SoLWalletAddr' }),
    w({ address: '0xUnverifiedXX', verified_at: null }),
  ])
  assert.strictEqual(message, 'Connect one of your linked wallets to sign this transaction')
})

test('both bound refusals name the exact wallet the escrow needs', () => {
  assert.match(BOUND_WALLET_REFUSAL.unlinked('0xAaaaBBBBcccc'), /0xAa…cccc/)
  assert.match(BOUND_WALLET_REFUSAL.wrongWallet('0xAaaaBBBBcccc'), /0xAa…cccc/)
})

test('the two bound refusals say DIFFERENT things to do', () => {
  // One is fixed by re-linking, the other by connecting; a reader handed the
  // wrong instruction goes to a screen that cannot help them.
  assert.match(BOUND_WALLET_REFUSAL.unlinked('0xAaaaBBBBcccc'), /re-link it in Settings/)
  assert.match(BOUND_WALLET_REFUSAL.wrongWallet('0xAaaaBBBBcccc'), /^Connect /)
})

test('the short-funds warning states BOTH figures, held before needed', () => {
  assert.strictEqual(
    SIGNING_WALLET_COPY.shortFunds('2.5 USDC', '10 USDC'),
    'This wallet holds 2.5 USDC but 10 USDC is needed — switch wallet or add funds first.',
  )
})

test('the bound-wallet label is viewer-relative wording, not a generic "wallet"', () => {
  assert.strictEqual(BOUND_WALLET_LABEL, 'Your escrow wallet')
})
