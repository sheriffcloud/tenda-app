/**
 * The EVM gas seed (#53a) against a REAL node.
 *
 * The unit suites prove the sender's decisions with a fake port; this proves
 * the part a fake cannot: that a server-held key, viem, and a live chain
 * actually move native value to a new user's wallet, and that `send()` does not
 * resolve until it has.
 *
 * That second property is the reason this file exists. Solana's sender confirms
 * (`sendAndConfirmTransaction`); viem's `sendTransaction` resolves as soon as
 * the node accepts the tx. A sender that returned there would stamp a
 * real-looking tx_ref for a transfer that may never land — and `gas_grants` is
 * keyed (user_id, chain_id), so that user could never be seeded again. With
 * automine on, "waits for the receipt" and "does not wait" are indistinguishable;
 * turning it off is what makes the difference observable.
 *
 * WHAT THIS SUITE CANNOT GUARD, so nobody looks for it here: the confirmation
 * DEPTH. Anvil mines one block per transaction, so a sender asking for more
 * confirmations than the chain declares waits for a block nothing will produce
 * — and a deadline around the wait does not help, because the abandoned viem
 * poll keeps the process alive and the runner hangs anyway (both measured: 90s
 * and 100s). The depth is therefore guarded where it CAN fail fast, against the
 * manifest, in test/unit/gas-seed-sender-evm.test.ts.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { setTimeout as delay } from 'node:timers/promises'
import { parseEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { evmGasSeedSender } from '@server/features/gas-seed/senders/evm'
import {
  dispatchGasSeeds,
  type GasSeedSender,
  type GasSeedStore,
  type SeedableChain,
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
  sender = evmGasSeedSender({ rpc_url: fx.rpc_url, chain_id: ANVIL_CHAIN_ID, private_key: seedKey })
})

after(() => {
  if (!skip) fx.kill()
})

test('an UNFUNDED seed wallet cannot pay, and the transfer fails instead of half-succeeding', { skip }, async () => {
  // Runs before the wallet is funded, on purpose: this is the state every new
  // deployment starts in, and #53b's whole job is leaving it. The caller
  // (dispatchGasSeeds) releases the claimed slot on this throw, so the user is
  // seeded later rather than marked seeded now.
  const recipient = freshRecipient()
  await assert.rejects(() => sender.send({ to_address: recipient, amount_raw: SEED_AMOUNT }))
  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), 0n)
})

test('the seed lands: the recipient gains exactly the granted amount', { skip }, async () => {
  const funding = await fx.creatorWallet.sendTransaction({
    to: seedAddress,
    value: parseEther('1'),
  })
  await fx.pub.waitForTransactionReceipt({ hash: funding })

  const recipient = freshRecipient()
  const { tx_ref } = await sender.send({ to_address: recipient, amount_raw: SEED_AMOUNT })

  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
  // The tx_ref is a real, successful transaction — not a hash the sender made
  // up, and not one that reverted.
  const receipt = await fx.pub.getTransactionReceipt({ hash: tx_ref as `0x${string}` })
  assert.strictEqual(receipt.status, 'success')
  assert.strictEqual(receipt.to?.toLowerCase(), recipient.toLowerCase())
  assert.strictEqual(receipt.from.toLowerCase(), seedAddress.toLowerCase())
})

test('send() does not resolve until the transfer is mined', { skip }, async () => {
  await fx.node.setAutomine(false)
  try {
    const recipient = freshRecipient()
    let settled = false
    const pending = sender.send({ to_address: recipient, amount_raw: SEED_AMOUNT }).then((r) => {
      settled = true
      return r
    })

    // Long enough for a sender that skipped the receipt to have resolved: the
    // node has accepted the tx by now, it simply has not mined it.
    await delay(500)
    assert.strictEqual(settled, false, 'resolved before the tx was mined — the receipt is not being waited for')
    assert.strictEqual(await fx.pub.getBalance({ address: recipient }), 0n)

    // ONE block is enough on this chain — Base Sepolia's manifest entry declares
    // minConfirmations 1, and the sender takes its depth from there.
    await fx.node.mine({ blocks: 1 })
    const { tx_ref } = await pending
    assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
    assert.ok(tx_ref.startsWith('0x'))
  } finally {
    await fx.node.setAutomine(true)
  }
})

test('end to end: dispatchGasSeeds stamps the grant with the REAL on-chain tx', { skip }, async () => {
  const recipient = freshRecipient()
  const chain: SeedableChain = {
    chain_id: ANVIL_CHAIN_ID,
    namespace: 'eip155',
    gas_seed_amount_raw: SEED_AMOUNT,
  }
  const grants: Array<{ chain_id: string; tx_ref: string; amount_raw: string }> = []
  const store: GasSeedStore = {
    async findSeedableChains() {
      return [chain]
    },
    async findWalletAddress() {
      return recipient
    },
    async claimGrant(row) {
      grants.push({ chain_id: row.chain_id, tx_ref: row.tx_ref, amount_raw: row.amount_raw })
      return true
    },
    async finalizeGrant(_user_id, chain_id, tx_ref) {
      const g = grants.find((x) => x.chain_id === chain_id)
      if (g) g.tx_ref = tx_ref
    },
    async releaseGrant() {
      assert.fail('the transfer succeeded; the slot must not be released')
    },
  }

  const result = await dispatchGasSeeds(
    { store, senders: new Map([[ANVIL_CHAIN_ID, sender]]), log: { info() {}, warn() {} } },
    'user-1',
  )

  assert.strictEqual(result.skipped.length, 0)
  assert.strictEqual(result.granted.length, 1)
  const stamped = grants[0]?.tx_ref
  // The placeholder written by the claim must have been REPLACED by the hash
  // the chain returned — a stranded `pending:` ref is exactly what the
  // verify-gas-seed script reports as a failed grant.
  assert.strictEqual(stamped, result.granted[0]?.tx_ref)
  assert.ok(stamped !== undefined && !stamped.startsWith('pending:'))
  const receipt = await fx.pub.getTransactionReceipt({ hash: stamped as `0x${string}` })
  assert.strictEqual(receipt.status, 'success')
  assert.strictEqual(await fx.pub.getBalance({ address: recipient }), BigInt(SEED_AMOUNT))
})
