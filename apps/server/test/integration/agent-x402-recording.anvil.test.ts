/**
 * The RECORDER and the GUARD for #109's published examples.
 *
 * Ten reviewers read the agent contract on 2026-09-05 and all ten said the
 * same thing: they never called it, and the document showed them no payload.
 * It contained zero `example` keys — past tense, because this suite is what
 * fixed that. And it is a RECORDING rather than a hand-written sample for one
 * reason: a sample is a second implementation of the wire, and it starts
 * drifting the day it is written. Everything published in
 * `@tenda/api-doc`'s `examples.ts` came out of an actual exchange this file drove,
 * and every run re-drives it and compares.
 *
 * WHY ANVIL AND NOT THE ORDINARY HARNESS. The fake eip155 relay answers
 * `quote` with empty EIP-712 `types` and a zero nonce. That is correct for
 * asserting route behaviour — the other agent suites want a constant — and it
 * would be a lie as a published example, because `payment.typed_data` is the
 * one part of the 402 an agent has to sign. Here the REAL adapter runs against
 * a real node holding the real escrow contract and a real EIP-3009 token, so
 * the terms carry the token's own domain separator, populated types, and a
 * nonce the contract agrees with. The chain id anvil presents is
 * `eip155:84532`, the same one the harness seeds — but the TOKEN and ESCROW
 * addresses are anvil's deterministic deployments, not Base Sepolia's, and the
 * published operation says so (#133): a reader who signed the example's
 * verifyingContract would be signing for a contract that does not exist.
 *
 * TO RE-RECORD after a deliberate wire change: `pnpm record:x402`.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import type { FastifyInstance } from 'fastify'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { evmAdapter } from '@server/chains/evm'
import { viemEvmRelayer } from '@server/chains/evm/relay/relayer'
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  apiRoutes,
  type AgentTaskCreated,
  type AgentTaskPaymentRequired,
  type GigDetail,
} from '@tenda/shared'
import { ANVIL_CHAIN_ID, ANVIL_KEYS, ERC20_ABI, anvilSkip, startAnvilFixture, type AnvilFixture } from '../helpers/anvil'
import {
  TEST_DB_CONFIGURED,
  authHeader,
  buildTestApp,
  realEvmRegistry,
  resetDb,
  seedAltChain,
} from '../helpers/test-app'
import { agentTaskBody, registerAgent, signRelayTerms } from '../helpers/agent'
import { VOLATILE, sameShape, writeRecording } from '../helpers/x402-recording'
import { RECORDED_EXCHANGE, type RecordedExchange } from '@tenda/api-doc'

/**
 * RECORD MODE MUST NEVER SKIP. `pnpm record:x402` is an explicit instruction to
 * re-capture, and answering it with a silent SKIP and exit 0 tells an operator
 * the examples were refreshed when they were not — after which the stale
 * recording ships, because the guard below skips in the same environment for
 * the same reason. MEASURED before this was here: `node --test` reported
 * "1 skipped", exited 0, and left recorded-exchange.ts byte-identical. So the
 * prerequisites are named and thrown when recording was actually asked for.
 */
const RECORDING = process.env.RECORD_X402 === '1'
const MISSING_PREREQUISITES: readonly string[] = [
  ...(anvilSkip ? ['anvil and the forge artifacts (contracts/evm/out)'] : []),
  ...(TEST_DB_CONFIGURED ? [] : ['TEST_DATABASE_URL']),
]
const skip = !RECORDING && MISSING_PREREQUISITES.length > 0
const PORT = 8576

/** The agent: a fresh key holding the token and no ETH — the case the relay exists for. */
const agent = privateKeyToAccount(generatePrivateKey())

let fx: AnvilFixture
let app: FastifyInstance

before(async () => {
  if (skip) return
  if (MISSING_PREREQUISITES.length > 0) {
    throw new Error(
      `pnpm record:x402 cannot capture anything: ${MISSING_PREREQUISITES.join(' and ')} missing. ` +
        'Nothing was written; the published examples are unchanged.',
    )
  }
  fx = await startAnvilFixture(PORT)
  const mint = await fx.creatorWallet.writeContract({
    address: fx.tokenAddr,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [agent.address, 100_000_000n],
  })
  await fx.pub.waitForTransactionReceipt({ hash: mint })
  const adapter = evmAdapter({
    chain_id: ANVIL_CHAIN_ID,
    rpc_url: fx.rpc_url,
    escrow_contract: fx.escrowAddr,
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => fx.worker.address,
      resolveAsset: async () => ({ token_address: fx.tokenAddr }),
      relayer: viemEvmRelayer({
        rpc_url: fx.rpc_url,
        rpc_url_fallback: undefined,
        chain_id: ANVIL_CHAIN_ID,
        private_key: ANVIL_KEYS.relayer,
      }),
    },
  })
  app = await buildTestApp({ chains: realEvmRegistry(adapter) })
})

after(async () => {
  if (app !== undefined) await app.close()
  fx?.kill()
})

/**
 * Drive the whole one-shot against the real node and hand back exactly what
 * crossed the wire. One function, because the recorder and the guard must
 * capture by the SAME path — two capture routines is the drift this design
 * exists to prevent.
 */
async function captureExchange(): Promise<RecordedExchange> {
  await resetDb(app)
  await seedAltChain(app)
  const registered = await registerAgent(app, { address: agent.address })
  const body = agentTaskBody()

  const quoted = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(registered.token),
    payload: body,
  })
  assert.strictEqual(quoted.statusCode, 402, quoted.body)
  const terms = quoted.json<AgentTaskPaymentRequired>()

  // Sign the terms the server actually handed back, through the SAME helper the
  // relay suite uses — no re-derivation here, or the recording would document
  // what this test believes rather than what the server said.
  const offer = terms.accepts[0]
  assert.ok(offer !== undefined, 'the 402 carried no terms to sign')
  const envelope = await signRelayTerms(agent, offer)

  const created = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: { ...authHeader(registered.token), [X_PAYMENT_HEADER]: Buffer.from(JSON.stringify(envelope)).toString('base64') },
    payload: body,
  })
  assert.strictEqual(created.statusCode, 201, created.body)

  const polled = await app.inject({
    method: 'GET',
    url: apiRoutes.gigs.get.replace(':id', terms.task_id),
    headers: authHeader(registered.token),
  })
  assert.strictEqual(polled.statusCode, 200, polled.body)

  return {
    polled: polled.json<GigDetail>(),
    request: body,
    payment_required: terms,
    payment_envelope: envelope,
    created: created.json<AgentTaskCreated>(),
    settlement: JSON.parse(
      Buffer.from(String(created.headers[X_PAYMENT_RESPONSE_HEADER]), 'base64').toString('utf8'),
    ) as RecordedExchange['settlement'],
  }
}

test('the exchange runs end to end against a real node, and the published examples still match it', { skip }, async () => {
  const live = await captureExchange()

  if (RECORDING) {
    writeRecording(live)
    return
  }

  // SHAPE, not bytes. Ids, deadlines, nonces and signatures differ every run —
  // pinning them would make this fail for the one reason that means nothing.
  // What must not change is the set of keys at every depth: a field added,
  // renamed or dropped by the server is precisely the drift that turns a
  // published example into a lie, and it is invisible to schema validation of
  // a static document.
  const differences = sameShape(RECORDED_EXCHANGE, live, VOLATILE)
  assert.deepStrictEqual(
    differences,
    [],
    'the published examples no longer match what the server sends — re-record with `pnpm record:x402`',
  )
})

/*
 * The recording's own properties — signable typed data, an envelope that
 * matches the terms, a settlement naming the 201's transaction — are asserted
 * in test/unit/agent-api-examples.test.ts instead of here, ON PURPOSE. They
 * are properties of a static file, so they must not be gated behind a
 * toolchain: this suite skips wherever anvil or the database is absent, and a
 * guard that skips is not a guard. What can only be checked HERE is the one
 * thing above — that the server still sends what was recorded.
 */
