/**
 * The Solana gas seed's TRANSFER, against the real Solana runtime (#53b item 5,
 * extended at #58).
 *
 * This is the gap #53a made visible rather than caused: its EVM twin reached
 * 100% while the whole body of Solana's `send` — the SystemProgram transfer
 * that actually pays a user — had no test at all, because it built a
 * `Connection` from an RPC URL and could only be exercised against a cluster.
 * The port seam (`SolanaGasSeedPort`, mirroring `EvmGasSeedPort`) is what makes
 * it reachable; LiteSVM runs the same runtime a validator does, so "the
 * lamports arrived" is measured rather than assumed.
 *
 * The task's own instruction was to do this BEFORE funding a hot wallet: an
 * untested transfer body is the last thing standing between a funded seed
 * wallet and a user.
 *
 * SINCE #58 it also proves the two properties the rework rests on, and neither
 * is checkable against a mock: that the signature is known BEFORE anything is
 * submitted (so the grant row can record it first), and that a transaction the
 * runtime accepted and then FAILED reads as `failed` rather than `delivered`.
 * That second one is #57 — the bug that marked users permanently seeded having
 * received nothing.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert'
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import bs58 from 'bs58'
import { solanaGasSeedSenderFromPort } from '@server/features/gas-seed/senders/solana'
import type { GasSeedSender } from '@server/features/gas-seed'
import { litesvmGasSeedPort, litesvmSkip, startLiteSvm, type LiteSvmFixture } from '../helpers/litesvm'

const skip = litesvmSkip

/**
 * Sign and broadcast, the way the claim job does it minus the database.
 *
 * A local helper rather than a `send()` on the sender, because the split IS the
 * design: production records the reference between these two calls, and a test
 * helper that hid the seam would stop the suite from noticing if it closed.
 */
async function payOut(s: GasSeedSender, to_address: string, amount_raw: string): Promise<string> {
  const signed = await s.sign({ to_address, amount_raw })
  await signed.broadcast()
  return signed.tx_ref
}

/** The manifest's Solana seed today — lamports, not wei. */
const SEED_LAMPORTS = '7000000'

let fx: LiteSvmFixture
let funder: Keypair
let sender: GasSeedSender

before(async () => {
  if (skip) return
  fx = await startLiteSvm()
  funder = Keypair.generate()
  // A hot wallet with real lamports, which is the state a funded deployment is
  // in. Everything below asks what happens to them.
  fx.svm.airdrop(funder.publicKey, BigInt(LAMPORTS_PER_SOL))
  sender = solanaGasSeedSenderFromPort(litesvmGasSeedPort(fx.svm, funder))
})

after(() => {
  // LiteSVM is in-process; nothing to tear down, but the hook documents that
  // deliberately rather than leaving a reader wondering what was leaked.
})

test('the seed LANDS: a fresh wallet gains exactly the granted lamports', { skip }, async () => {
  const recipient = Keypair.generate().publicKey
  assert.strictEqual(fx.svm.getBalance(recipient) ?? 0n, 0n, 'a fresh account holds nothing')

  const tx_ref = await payOut(sender, recipient.toBase58(), SEED_LAMPORTS)

  assert.strictEqual(fx.svm.getBalance(recipient), BigInt(SEED_LAMPORTS))
  // A real signature, not a fabricated string: `gas_grants.tx_ref` is what
  // verify-gas-seed later looks up on-chain, and a made-up ref would pass every
  // in-process assertion and fail only in production.
  assert.strictEqual(bs58.decode(tx_ref).length, 64)
})

test('the funder PAYS: the lamports come out of the hot wallet, plus fees', { skip }, async () => {
  const before_ = fx.svm.getBalance(funder.publicKey) ?? 0n
  const recipient = Keypair.generate().publicKey

  await payOut(sender, recipient.toBase58(), SEED_LAMPORTS)

  const after_ = fx.svm.getBalance(funder.publicKey) ?? 0n
  const spent = before_ - after_
  // Strictly MORE than the grant: the hot wallet also pays the transaction fee,
  // which is the reason a balance floor cannot simply be `amount_raw` (#53b
  // item 4 sizes the floor with headroom for exactly this).
  assert.ok(spent > BigInt(SEED_LAMPORTS), `funder spent ${spent}, grant is ${SEED_LAMPORTS}`)
})

test('a seed ADDS to a wallet that already holds something', { skip }, async () => {
  // Not a supported flow — the grant's primary key allows one per user per
  // chain — but it pins that the transfer is additive rather than a set. A
  // sender that somehow replaced a balance would be catastrophic and silent.
  //
  // The two amounts DIFFER on purpose: LiteSVM keeps one live blockhash, so two
  // identical transfers from the same payer to the same account produce the
  // same signature and the second is rejected as already processed. That is a
  // property of the harness, not of the sender.
  const recipient = Keypair.generate().publicKey
  const second = '3000000'
  await payOut(sender, recipient.toBase58(), SEED_LAMPORTS)
  await payOut(sender, recipient.toBase58(), second)
  assert.strictEqual(fx.svm.getBalance(recipient), BigInt(SEED_LAMPORTS) + BigInt(second))
})

test('an UNFUNDED hot wallet does not pay, and the failure is VISIBLE (#57)', { skip }, async () => {
  // The state every new deployment starts in, and since #58 the interesting part
  // is no longer just that nothing moved — it is that the runtime's rejection
  // reaches `checkStatus` as `failed` rather than being mistaken for a delivery.
  // The old code confirmed such a transaction and discarded the error it carried,
  // so the user was stamped seeded with nothing.
  const empty = Keypair.generate()
  const broke = solanaGasSeedSenderFromPort(litesvmGasSeedPort(fx.svm, empty))
  const recipient = Keypair.generate().publicKey

  const signed = await broke.sign({ to_address: recipient.toBase58(), amount_raw: SEED_LAMPORTS })
  await signed.broadcast()

  assert.strictEqual(fx.svm.getBalance(recipient) ?? 0n, 0n, 'nothing moved')
  const status = await broke.checkStatus({ tx_ref: signed.tx_ref, submitted_at: new Date() })
  assert.strictEqual(status, 'failed', 'a transfer the runtime refused must never read as delivered')
})

test('the SIGNATURE is known before anything is broadcast', { skip }, async () => {
  // The property the whole ordering depends on: the claim job records this
  // reference BEFORE the transfer can move money. If signing did not yield it,
  // there would be no moment at which the hash is known and the money is safe.
  const recipient = Keypair.generate().publicKey
  const signed = await sender.sign({ to_address: recipient.toBase58(), amount_raw: SEED_LAMPORTS })

  assert.strictEqual(bs58.decode(signed.tx_ref).length, 64, 'a real 64-byte signature')
  assert.strictEqual(fx.svm.getBalance(recipient) ?? 0n, 0n, 'signing must move nothing')

  await signed.broadcast()
  assert.strictEqual(fx.svm.getBalance(recipient), BigInt(SEED_LAMPORTS))
  // And the reference recorded before the broadcast is the one the runtime
  // executed — a mismatch here would leave every grant pointing at a phantom.
  assert.strictEqual(
    await sender.checkStatus({ tx_ref: signed.tx_ref, submitted_at: new Date() }),
    'delivered',
  )
})

test('a signature the cluster never saw is PENDING while it could still land', { skip }, async () => {
  // The absence that must not be read as failure yet. Solana resolves it later,
  // by expiry — but "later" is the whole point, and doing it immediately is what
  // released a slot whose money had already left.
  const unseen = bs58.encode(Buffer.alloc(64, 7))
  assert.strictEqual(
    await sender.checkStatus({ tx_ref: unseen, submitted_at: new Date() }),
    'pending',
  )
})

test('a malformed destination throws HERE, before any transfer is attempted', { skip }, async () => {
  // `new PublicKey(...)` is the sender's own guard. Letting a bad address reach
  // web3.js buries the failure several frames down, and the address comes from
  // `user_wallets` — data, not a literal.
  const before_ = fx.svm.getBalance(funder.publicKey) ?? 0n
  await assert.rejects(() =>
    sender.sign({ to_address: 'not-a-solana-address', amount_raw: SEED_LAMPORTS }),
  )
  assert.strictEqual(fx.svm.getBalance(funder.publicKey), before_, 'the hot wallet was untouched')
})

test('a non-numeric amount throws before the transfer, not during it', { skip }, async () => {
  const before_ = fx.svm.getBalance(funder.publicKey) ?? 0n
  await assert.rejects(() =>
    sender.sign({ to_address: Keypair.generate().publicKey.toBase58(), amount_raw: 'lots' }),
  )
  assert.strictEqual(fx.svm.getBalance(funder.publicKey), before_)
})
