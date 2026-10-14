/**
 * The EVM gas seed (#53a, reworked at #58) against a REAL node.
 *
 * The unit suites prove the decisions with a fake port; this proves the part a
 * fake cannot — that a server-held key, viem and a live chain actually move
 * native value to a new user's wallet, and that the three steps the design rests
 * on behave as claimed against real infrastructure:
 *
 *   1. `sign()` yields the transaction's FINAL hash while broadcasting nothing.
 *      Everything about not losing money depends on that hash existing before
 *      the transfer can. Against a mock it would be the mock under assertion.
 *   2. `checkStatus()` folds viem's TransactionReceiptNotFoundError to `pending`
 *      rather than letting it escape. viem THROWS for an unknown hash, and the
 *      old code's equivalent branch turned that throw into a released slot.
 *   3. The two jobs, run in order over one grant, deliver a seed end to end.
 *
 * WHAT THIS SUITE CANNOT GUARD, so nobody looks for it here: the confirmation
 * DEPTH beyond 1. Anvil mines one block per transaction, so a chain asking for
 * more confirmations than it produces would wait for a block that never comes —
 * and a deadline around the wait does not help, because the abandoned poll keeps
 * the process alive and the runner hangs anyway (measured: 90s and 100s). Depth
 * is therefore guarded where it CAN fail fast, against the manifest and over the
 * arithmetic, in test/unit/gas-seed-sender-evm.test.ts.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { parseEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  evmGasSeedFunder,
  evmGasSeedPort,
  evmGasSeedSender,
} from '@server/features/gas-seed/senders/evm'
import {
  handleGasSeedClaim,
  handleGasSeedConfirm,
  type GrantForJob,
  type GasSeedSender,
} from '@server/features/gas-seed'
import {
  ANVIL_CHAIN_ID,
  anvilSkip,
  startAnvilFixture,
  type AnvilFixture,
} from '../helpers/anvil'

const skip = anvilSkip
const PORT = 8574

/** 0.01 native, the shape of the 0G placeholder — 18 decimals, not lamports. */
const SEED_AMOUNT = '10000000000000000'

let fx: AnvilFixture
let seedKey: `0x${string}`
let seedAddress: `0x${string}`
/**
 * ONE sender for the file, built before its wallet holds anything.
 *
 * The first case below runs against it UNFUNDED and the rest after it has been
 * funded, which is why the order of the tests is load-bearing here. A reorder
 * fails loudly rather than quietly: a funded wallet makes the unfunded case's
 * `assert.rejects` fail, which is the outcome to want from an implicit
 * dependency that cannot be expressed in node:test.
 */
let sender: GasSeedSender

/** A wallet nobody has ever paid, so its balance IS what the seed delivered. */
function freshRecipient(): `0x${string}` {
  return privateKeyToAccount(generatePrivateKey()).address
}

before(async () => {
  if (skip) return
  fx = await startAnvilFixture(PORT)
  seedKey = generatePrivateKey()
  seedAddress = privateKeyToAccount(seedKey).address
  sender = evmGasSeedSender({
    rpc_url: fx.rpc_url,
    // One anvil node; this suite measures behaviour, not redundancy.
    rpc_url_fallback: undefined,
    chain_id: ANVIL_CHAIN_ID,
    private_key: seedKey,
  })
})

after(() => {
  if (!skip) fx.kill()
})

test('an UNFUNDED seed wallet cannot pay, and nothing half-succeeds', { skip }, async () => {
  // Runs before the wallet is funded, on purpose: this is the state every new
  // deployment starts in. The failure surfaces from the BROADCAST, not from
  // signing — signing only needs a nonce and a gas estimate — and the claim job
  // pre-flights the balance precisely so this case is caught before a signature
  // exists.
  const recipient = freshRecipient()
  const signed = await sender.sign({ to_address: recipient, amount_raw: SEED_AMOUNT })
  await assert.rejects(() => signed.broadcast())
  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), 0n)
})

test('the seed lands: the recipient gains exactly the granted amount', { skip }, async () => {
  const funding = await fx.creatorWallet.sendTransaction({
    to: seedAddress,
    value: parseEther('1'),
  })
  await fx.pub.waitForTransactionReceipt({ hash: funding })

  const recipient = freshRecipient()
  const signed = await sender.sign({ to_address: recipient, amount_raw: SEED_AMOUNT })
  await signed.broadcast()
  await fx.pub.waitForTransactionReceipt({ hash: signed.tx_ref as `0x${string}` })

  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
  const receipt = await fx.pub.getTransactionReceipt({ hash: signed.tx_ref as `0x${string}` })
  assert.strictEqual(receipt.status, 'success')
  assert.strictEqual(receipt.to?.toLowerCase(), recipient.toLowerCase())
  assert.strictEqual(receipt.from.toLowerCase(), seedAddress.toLowerCase())
})

test('sign() yields the REAL hash and broadcasts nothing', { skip }, async () => {
  // The property the whole ordering depends on, against a real node rather than
  // a fake: the hash is derivable from the signed bytes alone, so the grant row
  // can record it before any money can move — and the node later reports that
  // very hash, so the record is not merely early but correct.
  await fx.node.setAutomine(false)
  try {
    const recipient = freshRecipient()
    const signed = await sender.sign({ to_address: recipient, amount_raw: SEED_AMOUNT })

    assert.ok(signed.tx_ref.startsWith('0x') && signed.tx_ref.length === 66, 'a real 32-byte hash')
    // Nothing was submitted, so the node has never heard of it.
    await assert.rejects(() =>
      fx.pub.getTransaction({ hash: signed.tx_ref as `0x${string}` }),
    )
    assert.strictEqual(await fx.pub.getBalance({ address: recipient }), 0n)

    await signed.broadcast()
    // Now it exists, unmined, under the SAME hash that was known before.
    const pending = await fx.pub.getTransaction({ hash: signed.tx_ref as `0x${string}` })
    assert.strictEqual(pending.hash, signed.tx_ref)
    assert.strictEqual(await fx.pub.getBalance({ address: recipient }), 0n, 'accepted, not mined')

    await fx.node.mine({ blocks: 1 })
    assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
  } finally {
    await fx.node.setAutomine(true)
  }
})

test('checkStatus: pending before mining, delivered after, null hash never throws', { skip }, async () => {
  // The branch the design turns on. viem THROWS TransactionReceiptNotFoundError
  // for a hash it holds no receipt for; production must answer `pending`,
  // because on EVM an absent receipt means NOT YET — the transaction is pinned
  // at a nonce and can still be mined. Against a fake port this would be the
  // test's own lambda under assertion rather than this code.
  await fx.node.setAutomine(false)
  try {
    const recipient = freshRecipient()
    const signed = await sender.sign({ to_address: recipient, amount_raw: SEED_AMOUNT })
    await signed.broadcast()

    const submitted_at = new Date()
    assert.strictEqual(
      await sender.checkStatus({ tx_ref: signed.tx_ref, submitted_at }),
      'pending',
      'broadcast but unmined must read as pending, never as failed',
    )

    await fx.node.mine({ blocks: 1 })
    assert.strictEqual(
      await sender.checkStatus({ tx_ref: signed.tx_ref, submitted_at }),
      'delivered',
    )
  } finally {
    await fx.node.setAutomine(true)
  }
})

test('checkStatus: a hash this chain has never seen is pending, not an error', { skip }, async () => {
  const unseen = `0x${'11'.repeat(32)}`
  assert.strictEqual(
    await sender.checkStatus({ tx_ref: unseen, submitted_at: new Date() }),
    'pending',
    'an unknown hash must fold to pending, not escape as a throw',
  )
})

test('the REAL port exposes sign, send, receipt and head against the node', { skip }, async () => {
  // Drives `evmGasSeedPort` directly, because the sender above only ever sees
  // its own composition of it. `receipt()` returning null for an unknown hash is
  // the fold that keeps a timed-out confirmation from freeing a paid slot.
  const port = evmGasSeedPort({
    rpc_url: fx.rpc_url,
    rpc_url_fallback: undefined,
    chain_id: ANVIL_CHAIN_ID,
    private_key: seedKey,
  })
  const { hash, raw } = await port.sign({ to: freshRecipient(), value: parseEther('0.001') })
  assert.strictEqual(await port.receipt(hash), null, 'unsigned-to-the-node hash has no receipt')

  await port.send(raw)
  await fx.pub.waitForTransactionReceipt({ hash })

  const receipt = await port.receipt(hash)
  assert.strictEqual(receipt?.status, 'success')
  assert.ok((receipt?.block_number ?? 0n) > 0n, 'the receipt carries the block that mined it')
  assert.ok(await port.head() >= (receipt?.block_number ?? 0n), 'the head is at or past it')

  const unseen = `0x${'22'.repeat(32)}` as `0x${string}`
  assert.strictEqual(await port.receipt(unseen), null, 'viem throws here; production must not')
})

test('END TO END: claim job then confirm job deliver a seed and stamp the grant', { skip }, async () => {
  // Both halves over one grant, against a real chain — the path a user's tap
  // actually takes. An in-memory row stands in for `gas_grants`, but every
  // transition is driven by the production handlers, so the ORDER they write in
  // is what is under test as much as the outcome.
  const recipient = freshRecipient()
  let row: GrantForJob = {
    status: 'claimed',
    tx_ref: null,
    amount_raw: SEED_AMOUNT,
    wallet_address: recipient,
    submitted_at: null,
  }
  let released = false
  let notified = 0
  const confirms: Array<{ user_id: string; chain_id: string }> = []
  const job = { user_id: 'user-1', chain_id: ANVIL_CHAIN_ID }
  const senders = new Map([[ANVIL_CHAIN_ID, sender]])
  const claim = { findGrantForJob: async (): Promise<GrantForJob | null> => (released ? null : row) }
  const log = { info(): void {}, warn(): void {} }

  const outcome = await handleGasSeedClaim(
    {
      seed: {
        async markSubmitted({ tx_ref, submitted_at }) {
          // The row must NOT already hold a reference — that is the guard.
          if (row.status !== 'claimed') return false
          row = { ...row, status: 'submitted', tx_ref, submitted_at }
          return true
        },
        async releaseGrant() {
          released = true
        },
      },
      claim,
      senders,
      funders: new Map([
        [
          ANVIL_CHAIN_ID,
          {
            address: seedAddress,
            balance: () => fx.pub.getBalance({ address: seedAddress }),
          },
        ],
      ]),
      enqueueConfirm: async (j) => {
        confirms.push(j)
      },
      log,
    },
    job,
  )

  assert.strictEqual(outcome, 'submitted')
  assert.strictEqual(row.status, 'submitted')
  assert.ok(row.tx_ref?.startsWith('0x'), 'the grant records the real hash')
  assert.deepStrictEqual(confirms, [job], 'the confirmation must be queued')
  assert.strictEqual(released, false)

  // The transaction is on chain; the confirm job is what decides it landed.
  await fx.pub.waitForTransactionReceipt({ hash: row.tx_ref as `0x${string}` })

  const confirmed = await handleGasSeedConfirm(
    {
      seed: {
        async markDelivered() {
          row = { ...row, status: 'delivered' }
        },
        async markUnresolved() {
          assert.fail('a mined transfer must never be left unresolved')
        },
        async releaseGrant() {
          assert.fail('a delivered transfer must never release its slot')
        },
      },
      claim,
      senders,
      async notify(notice) {
        notified += 1
        assert.strictEqual(notice.tx_ref, row.tx_ref)
      },
      log,
    },
    job,
  )

  assert.strictEqual(confirmed, 'delivered')
  assert.strictEqual(row.status, 'delivered')
  assert.strictEqual(notified, 1, 'the user is told exactly once')
  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
})

test('the funder reports the hot wallet\'s real balance, from the same key', { skip }, async () => {
  // The availability read refuses a claim the hot wallet cannot cover, and this
  // is the number that decision rests on. A unit fake proves the comparison;
  // only a node proves the READ — that `balance()` asks the right chain about
  // the right address and answers in the base units the amount is denominated
  // in (wei here, not ether).
  const funder = evmGasSeedFunder({
    rpc_url: fx.rpc_url,
    rpc_url_fallback: undefined,
    chain_id: ANVIL_CHAIN_ID,
    private_key: seedKey,
  })

  assert.strictEqual(funder.address, seedAddress, 'the funder named a different wallet than it reads')
  const observed = await funder.balance()
  assert.strictEqual(observed, await fx.pub.getBalance({ address: seedAddress }))
  assert.ok(observed > BigInt(SEED_AMOUNT), `funder balance ${observed} cannot cover a grant`)
})
