/**
 * features/gas-seed/senders/evm — the decisions the sender makes ABOVE the node
 * (#53a, reworked at #58), driven through its port so every branch is reachable
 * offline. The wiring to a real chain is proved by test/integration/evm-gas-seed.anvil.
 *
 * TWO BRANCHES HERE CANNOT BE REACHED FROM A REAL CHAIN AT ALL, which is why the
 * port exists. A plain value transfer to an EOA cannot revert, so no anvil
 * scenario produces a `reverted` receipt; and anvil mines instantly, so no anvil
 * scenario produces a receipt that is mined but not yet buried to the chain's
 * confirmation depth. Both decide whether a user keeps their money, and
 * `gas_grants` is keyed (user_id, chain_id) — a wrong answer is permanent.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { getAddress, type Hex } from 'viem'
import { chainById, evmManifestEntries } from '@tenda/shared'
import {
  classifyEvmReceipt,
  evmGasSeedSenderFromPort,
  gasSeedConfirmations,
  receiptDepth,
  type EvmGasSeedPort,
  type EvmSeedReceipt,
} from '@server/features/gas-seed/senders/evm'

const HASH = `0x${'ab'.repeat(32)}` as Hex
const RAW = `0x${'cd'.repeat(64)}` as Hex
/** A real checksummed address (Base USDC), used as the recipient throughout. */
const WALLET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
/** Base Sepolia — minConfirmations 1, so depth arithmetic is easy to reason about. */
const CHAIN = 'eip155:84532'

interface Signed {
  to: `0x${string}`
  value: bigint
}

function makePort(
  opts: {
    signFails?: boolean
    sendFails?: boolean
    receipt?: EvmSeedReceipt | null
    head?: bigint
  } = {},
): { port: EvmGasSeedPort; signed: Signed[]; broadcast: Hex[]; looked: Hex[] } {
  const signed: Signed[] = []
  const broadcast: Hex[] = []
  const looked: Hex[] = []
  return {
    signed,
    broadcast,
    looked,
    port: {
      async sign(args) {
        if (opts.signFails ?? false) throw new Error('nonce fetch failed')
        signed.push(args)
        return { hash: HASH, raw: RAW }
      },
      async send(raw) {
        if (opts.sendFails ?? false) throw new Error('insufficient funds for gas * price + value')
        broadcast.push(raw)
      },
      async receipt(hash) {
        looked.push(hash)
        return opts.receipt ?? null
      },
      head: async () => opts.head ?? 100n,
    },
  }
}

// ---------- depth arithmetic --------------------------------------------------

test('receiptDepth: a receipt in the HEAD block has depth 1, not 0', () => {
  // The off-by-one that matters. A transaction in the head block has been
  // confirmed once — by the block containing it — which is what makes a chain
  // declaring minConfirmations 1 mean "mined" rather than "mined and one more".
  assert.strictEqual(receiptDepth(100n, 100n), 1n)
  assert.strictEqual(receiptDepth(99n, 100n), 2n)
  assert.strictEqual(receiptDepth(98n, 100n), 3n)
})

test('receiptDepth never goes negative when the head read lags the receipt', () => {
  // Two reads against a failover transport can hit different endpoints, so a
  // head BEHIND the receipt's own block is reachable. Negative depth would
  // compare as "deep enough" against a small confirmations value on some
  // arithmetic; clamping keeps the comparison honest.
  assert.strictEqual(receiptDepth(101n, 100n), 0n)
  assert.strictEqual(receiptDepth(150n, 100n), 0n)
})

// ---------- what a receipt MEANS ---------------------------------------------

test('classifyEvmReceipt: no receipt is PENDING — an EVM tx does not expire', () => {
  // The rule that separates this from Solana, and the drain that reading it the
  // other way opens: a nonce-pinned transaction sits in mempools and can be
  // mined hours later, so releasing the slot here pays the user a second time.
  assert.strictEqual(classifyEvmReceipt(null, 100n, 1), 'pending')
})

test('classifyEvmReceipt: a reverted receipt is FAILED at any depth', () => {
  // The chain answered. Depth is irrelevant to an answer that says the transfer
  // did not move money — waiting for a failure to bury itself deeper would only
  // delay releasing a slot the user is owed.
  assert.strictEqual(classifyEvmReceipt({ status: 'reverted', block_number: 100n }, 100n, 1), 'failed')
  assert.strictEqual(classifyEvmReceipt({ status: 'reverted', block_number: 90n }, 100n, 3), 'failed')
})

test('classifyEvmReceipt: mined but not deep enough is PENDING, not delivered', () => {
  // Celo asks for 3. Stamping at depth 1 would let a reorg strand a user the
  // primary key already records as paid, and nothing can undo that.
  assert.strictEqual(classifyEvmReceipt({ status: 'success', block_number: 100n }, 100n, 3), 'pending')
  assert.strictEqual(classifyEvmReceipt({ status: 'success', block_number: 99n }, 100n, 3), 'pending')
})

test('classifyEvmReceipt: delivered exactly AT the chain’s depth, not one past it', () => {
  // The boundary in both directions, so neither a `>` (which would wait for one
  // block more than the chain asks) nor a looser test can pass.
  assert.strictEqual(classifyEvmReceipt({ status: 'success', block_number: 98n }, 100n, 3), 'delivered')
  assert.strictEqual(classifyEvmReceipt({ status: 'success', block_number: 100n }, 100n, 1), 'delivered')
})

test('the depth comes from the CHAIN, never a fixed number', () => {
  // Every EVM chain, so the assertion cannot be satisfied by a constant that
  // happens to match the one chain a test picked: the manifest spans depths 1
  // (Base Sepolia, 0G Galileo), 2 (Base, 0G) and 3 (Celo).
  const depths = new Set<number>()
  for (const entry of evmManifestEntries()) {
    assert.strictEqual(gasSeedConfirmations(entry.id), chainById(entry.id).minConfirmations)
    depths.add(gasSeedConfirmations(entry.id))
  }
  assert.ok(depths.size > 1, `the manifest must span several depths (saw ${[...depths].join()})`)
})

// ---------- signing, and the order that protects the money -------------------

test('sign() returns the reference WITHOUT broadcasting', async () => {
  // The property the whole rework rests on: the caller can record the hash
  // before any money can move. If signing broadcast too, there would be no such
  // moment and a crash in the gap would lose the reference to a live transfer.
  const { port, signed, broadcast } = makePort()
  const tx = await evmGasSeedSenderFromPort(port, CHAIN).sign({
    to_address: WALLET,
    amount_raw: '10000000000000000',
  })
  assert.strictEqual(tx.tx_ref, HASH)
  assert.deepEqual(signed, [{ to: getAddress(WALLET), value: 10_000_000_000_000_000n }])
  assert.deepEqual(broadcast, [], 'signing must not put anything on the chain')
})

test('broadcast() is a separate step that sends the SIGNED bytes', async () => {
  const { port, broadcast } = makePort()
  const tx = await evmGasSeedSenderFromPort(port, CHAIN).sign({
    to_address: WALLET,
    amount_raw: '1000',
  })
  await tx.broadcast()
  assert.deepEqual(broadcast, [RAW], 'it must send what was signed, not re-sign')
})

test('an 18-decimal amount survives as an exact bigint', async () => {
  // 10^16 + 1 is beyond Number.MAX_SAFE_INTEGER: a sender that parsed the
  // amount through Number would send one wei less, and this is the only place
  // that difference is visible before it reaches the chain.
  const { port, signed } = makePort()
  await evmGasSeedSenderFromPort(port, CHAIN).sign({
    to_address: WALLET,
    amount_raw: '10000000000000001',
  })
  assert.equal(signed[0]?.value, 10_000_000_000_000_001n)
  assert.notEqual(signed[0]?.value, BigInt(Number('10000000000000001')))
})

test('a stored address is accepted in either casing and signed in canonical form', async () => {
  // `user_wallets` holds whatever spelling the client sent. EIP-55 casing is
  // cosmetic on eip155, so neither spelling may be refused, and both must reach
  // the node as the same address.
  for (const spelling of [WALLET, WALLET.toLowerCase()]) {
    const { port, signed } = makePort()
    await evmGasSeedSenderFromPort(port, CHAIN).sign({ to_address: spelling, amount_raw: '1000' })
    assert.equal(signed[0]?.to, getAddress(WALLET))
  }
})

test('a malformed recipient fails BEFORE anything is signed', async () => {
  for (const bad of ['', 'not-an-address', WALLET.slice(0, -2), `${WALLET}ff`]) {
    const { port, signed } = makePort()
    await assert.rejects(
      () => evmGasSeedSenderFromPort(port, CHAIN).sign({ to_address: bad, amount_raw: '1000' }),
      `'${bad}' must be refused`,
    )
    assert.equal(signed.length, 0, `'${bad}' must not reach the node`)
  }
})

test('a failed signing propagates — no tx_ref is invented', async () => {
  const { port, broadcast } = makePort({ signFails: true })
  await assert.rejects(
    () => evmGasSeedSenderFromPort(port, CHAIN).sign({ to_address: WALLET, amount_raw: '1000' }),
    /nonce fetch failed/,
  )
  assert.equal(broadcast.length, 0, 'nothing to broadcast when nothing was signed')
})

test('a refused broadcast propagates from broadcast(), not from sign()', async () => {
  // The distinction the claim job branches on: signing failing means no money
  // can have moved (release the slot), while a broadcast failing is ambiguous
  // (keep it). They must surface from different calls for that to be decidable.
  const { port } = makePort({ sendFails: true })
  const tx = await evmGasSeedSenderFromPort(port, CHAIN).sign({
    to_address: WALLET,
    amount_raw: '1000',
  })
  await assert.rejects(() => tx.broadcast(), /insufficient funds/)
})

// ---------- checkStatus -------------------------------------------------------

test('checkStatus asks about the hash it is given, at the chain’s depth', async () => {
  const { port, looked } = makePort({ receipt: { status: 'success', block_number: 100n }, head: 100n })
  const status = await evmGasSeedSenderFromPort(port, CHAIN).checkStatus({
    tx_ref: HASH,
    submitted_at: new Date(),
  })
  assert.strictEqual(status, 'delivered')
  assert.deepEqual(looked, [HASH], 'it must ask about the broadcast hash, not guess')
})

test('checkStatus IGNORES submitted_at — an EVM transfer never expires', async () => {
  // Deliberate asymmetry with Solana, and worth pinning: a very old unconfirmed
  // EVM transaction is still pending, because its nonce keeps it alive. Reading
  // age as death here would release a slot whose transfer can still land.
  const { port } = makePort({ receipt: null })
  const ancient = new Date(Date.now() - 365 * 24 * 3_600 * 1_000)
  const status = await evmGasSeedSenderFromPort(port, CHAIN).checkStatus({
    tx_ref: HASH,
    submitted_at: ancient,
  })
  assert.strictEqual(status, 'pending')
})
