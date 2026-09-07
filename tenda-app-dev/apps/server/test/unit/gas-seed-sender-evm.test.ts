/**
 * features/gas-seed/senders/evm — the decisions the sender makes ABOVE the node
 * (#53a), driven through its port so every branch is reachable offline. The
 * wiring to a real chain is proved by test/integration/evm-gas-seed.anvil.
 *
 * The branch that matters most is the receipt check. A plain value transfer to
 * an EOA cannot revert, so no anvil scenario produces a reverted receipt — and
 * the consequence of getting it wrong is not a failed transfer but a PERMANENT
 * one: `gas_grants` is keyed (user_id, chain_id), so a tx_ref stamped for a
 * transfer that never landed cannot be retried, ever.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { getAddress, type Hex } from 'viem'
import { chainById, evmManifestEntries } from '@tenda/shared'
import {
  evmGasSeedSenderFromPort,
  gasSeedConfirmations,
  type EvmGasSeedPort,
} from '@server/features/gas-seed/senders/evm'

const HASH = `0x${'ab'.repeat(32)}` as Hex
/** A real checksummed address (Base USDC), used as the recipient throughout. */
const WALLET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

interface Sent {
  to: `0x${string}`
  value: bigint
}

function makePort(opts: { status?: 'success' | 'reverted'; sendFails?: boolean } = {}): {
  port: EvmGasSeedPort
  sent: Sent[]
  confirmed: Hex[]
} {
  const sent: Sent[] = []
  const confirmed: Hex[] = []
  return {
    sent,
    confirmed,
    port: {
      async send(args) {
        if (opts.sendFails ?? false) throw new Error('insufficient funds for gas * price + value')
        sent.push(args)
        return HASH
      },
      async confirm(hash) {
        confirmed.push(hash)
        return { status: opts.status ?? 'success' }
      },
    },
  }
}

test('a confirmed transfer returns the tx hash as the grant tx_ref', async () => {
  const { port, sent, confirmed } = makePort()
  const result = await evmGasSeedSenderFromPort(port).send({
    to_address: WALLET,
    amount_raw: '10000000000000000',
  })
  assert.deepEqual(result, { tx_ref: HASH })
  assert.deepEqual(sent, [{ to: getAddress(WALLET), value: 10_000_000_000_000_000n }])
  assert.deepEqual(confirmed, [HASH], 'the receipt must be waited for, not assumed')
})

test('a REVERTED receipt throws, so the caller releases the grant instead of stamping it', async () => {
  const { port, sent } = makePort({ status: 'reverted' })
  await assert.rejects(
    () => evmGasSeedSenderFromPort(port).send({ to_address: WALLET, amount_raw: '1000' }),
    // The hash is in the message: without it an operator cannot look up what
    // actually happened on-chain.
    new RegExp(HASH),
  )
  assert.equal(sent.length, 1, 'it did broadcast — the failure is the confirmation, not the send')
})

test('an 18-decimal amount survives as an exact bigint', async () => {
  // 10^16 + 1 is beyond Number.MAX_SAFE_INTEGER: a sender that parsed the
  // amount through Number would send one wei less and this is the only place
  // that difference is visible before it reaches the chain.
  const { port, sent } = makePort()
  await evmGasSeedSenderFromPort(port).send({
    to_address: WALLET,
    amount_raw: '10000000000000001',
  })
  assert.equal(sent[0]?.value, 10_000_000_000_000_001n)
  assert.notEqual(sent[0]?.value, BigInt(Number('10000000000000001')))
})

test('a stored address is accepted in either casing and sent in canonical form', async () => {
  // `user_wallets` holds whatever spelling the client sent. EIP-55 casing is
  // cosmetic on eip155, so neither spelling may be refused, and both must reach
  // the node as the same address.
  for (const spelling of [WALLET, WALLET.toLowerCase()]) {
    const { port, sent } = makePort()
    await evmGasSeedSenderFromPort(port).send({ to_address: spelling, amount_raw: '1000' })
    assert.equal(sent[0]?.to, getAddress(WALLET))
  }
})

test('a malformed recipient fails BEFORE anything is broadcast', async () => {
  for (const bad of ['', 'not-an-address', WALLET.slice(0, -2), `${WALLET}ff`]) {
    const { port, sent } = makePort()
    await assert.rejects(
      () => evmGasSeedSenderFromPort(port).send({ to_address: bad, amount_raw: '1000' }),
      `'${bad}' must be refused`,
    )
    assert.equal(sent.length, 0, `'${bad}' must not reach the node`)
  }
})

test('a failed broadcast propagates — no tx_ref is invented', async () => {
  const { port, confirmed } = makePort({ sendFails: true })
  await assert.rejects(
    () => evmGasSeedSenderFromPort(port).send({ to_address: WALLET, amount_raw: '1000' }),
    /insufficient funds/,
  )
  assert.equal(confirmed.length, 0, 'nothing to confirm when nothing was sent')
})

test('the receipt is awaited at the CHAIN\'s confirmation depth, never a fixed one', () => {
  // Every EVM chain, so the assertion cannot be satisfied by a constant that
  // happens to match the one chain a test picked: the manifest spans depths 1
  // (Base Sepolia, 0G Galileo), 2 (Base, 0G) and 3 (Celo).
  const depths = new Set<number>()
  for (const entry of evmManifestEntries()) {
    assert.strictEqual(gasSeedConfirmations(entry.id), chainById(entry.id).minConfirmations)
    depths.add(gasSeedConfirmations(entry.id))
  }
  assert.ok(depths.size > 1, `the manifest must span several depths for this to bite (saw ${[...depths].join()})`)
})
