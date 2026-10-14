/**
 * `classifySolanaStatus` — what the cluster's answer about a seed transfer
 * MEANS, and the file where #57 is pinned.
 *
 * TWO REAL BUGS, both measured, live behind these five assertions.
 *
 * The first was a transfer that LANDED while confirmation threw: on devnet the
 * sender threw "block height exceeded" after 20,698ms with all 7,000,000
 * lamports already in the recipient's account, because the provider's HTTP key
 * did not authorise the WebSocket the confirmation subscribed on. The caller
 * read the throw as "it did not happen", released the claimed slot, and the
 * paid user could claim again — one grant per attempt, out of the hot wallet.
 *
 * The second is the mirror image and the subtler one: web3's confirmation
 * RESOLVES for a transaction that landed and FAILED. The resolved value carries
 * the error; the old code discarded it. So a transfer that moved no lamports was
 * stamped delivered, and `gas_grants`' (user_id, chain_id) key made that
 * permanent — that user could never be seeded again, having received nothing.
 *
 * Neither is expressible now. Nothing confirms; this function reads a status and
 * says which of three things the chain is telling us, and the case that used to
 * be unreachable from a test is the second assertion below.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { SOLANA_BLOCKHASH_VALIDITY_SECONDS } from '@tenda/shared'
import {
  classifySolanaStatus,
  SOLANA_SEED_EXPIRY_MS,
} from '@server/features/gas-seed/senders/solana'

/** Comfortably inside the window — a transfer broadcast moments ago. */
const FRESH = 1_000

test('a signature with no error is delivered', () => {
  assert.strictEqual(classifySolanaStatus({ err: null }, FRESH), 'delivered')
})

test('a signature that LANDED AND FAILED is a failure, not a delivery (#57)', () => {
  // THE BUG. On chain, so confirmation resolves — but the lamports never moved,
  // and stamping it delivered marks a user paid who was not, permanently.
  assert.strictEqual(
    classifySolanaStatus({ err: { InstructionError: [0, 'Custom'] } }, FRESH),
    'failed',
  )
})

test('a failed signature stays failed however long ago it was broadcast', () => {
  // Age must not soften an answer the chain already gave. A `failed` that aged
  // into `pending` would put the confirm job back into retrying a transaction
  // that is definitively finished.
  assert.strictEqual(
    classifySolanaStatus({ err: 'AccountNotFound' }, SOLANA_SEED_EXPIRY_MS * 10),
    'failed',
  )
})

test('no record, recently broadcast: PENDING — not yet is not never', () => {
  // The first bug's half. The cluster may simply not have caught up; treating
  // this as failure is what released a slot whose money had already left.
  assert.strictEqual(classifySolanaStatus(null, FRESH), 'pending')
})

test('no record, past the expiry window: failed — a Solana tx provably dies', () => {
  // The one place an ABSENCE becomes evidence, and it is legitimate here in a
  // way it never is on EVM: a Solana transaction is signed against a blockhash
  // and cannot land once that expires. Its EVM twin has no equivalent and
  // deliberately never resolves an absent receipt to failure.
  assert.strictEqual(classifySolanaStatus(null, SOLANA_SEED_EXPIRY_MS + 1), 'failed')
})

test('the expiry boundary is exclusive — exactly at the window is still pending', () => {
  // Pinned because the comparison is the whole rule, and `>=` here would call a
  // transfer dead at the precise moment its blockhash is still usable.
  assert.strictEqual(classifySolanaStatus(null, SOLANA_SEED_EXPIRY_MS), 'pending')
})

test('the window is derived from blockhash validity, with room to observe', () => {
  // Not a magic number: it must outlast the blockhash itself, or an absence
  // would be called definitive while the transaction can still land. The
  // multiple exists so `searchTransactionHistory` has time to find a transfer
  // that landed just before its blockhash died.
  assert.ok(
    SOLANA_SEED_EXPIRY_MS > SOLANA_BLOCKHASH_VALIDITY_SECONDS * 1_000,
    `expiry ${SOLANA_SEED_EXPIRY_MS}ms must exceed one blockhash lifetime`,
  )
})
