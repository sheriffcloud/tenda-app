/**
 * Chain listener webhooks — Helius (Solana) and Alchemy (EVM) — #105 T6.
 *
 * Both endpoints push transaction references into the verify-tx queue, and both
 * had every refusal in their handlers unexecuted. The pair that matters is the
 * authenticity check: Helius sends a static shared secret in `Authorization`,
 * Alchemy an HMAC over the raw body, and each is the only thing between an
 * unauthenticated caller and an enqueue.
 *
 * They are NOT the same shape, which is why both are here rather than one being
 * assumed to stand for the other: Helius compares a header to a secret
 * timing-safe (their webhook auth model is a static header, a documented
 * deviation from the stage doc's "HMAC" shorthand), while Alchemy signs the
 * bytes. A test written for one would not catch the other regressing.
 *
 * HOW THE CONFIGURED AND UNCONFIGURED ARMS BOTH FIT HERE. Chain secrets resolve
 * from `CHAIN_<ID>_<FIELD>` env into a process-wide cache, and
 * `resetChainSecretsCache()` is the seam that drops it. So a case can set or
 * clear the env, reset, and get the state it needs — no second file, and no
 * dependence on test order, because every case sets the state it wants.
 *
 * The env NAMES are derived, not guessed: `chainEnvPrefix('solana:devnet')` is
 * CHAIN_SOLANA_DEVNET and `chainEnvPrefix('eip155:84532')` is CHAIN_EIP155_84532
 * (verified by running it). eip155:84532 is the manifest's paymaster-policy
 * chain, which is what `paymasterChainSecret()` looks for, and the fake registry
 * always carries it — so `chains.has()` is true and the adapter-missing arm is
 * NOT reachable here (see the note at the end of this file).
 *
 * The Helius URL below is `/v1/webhooks/helius`, which since #106 is both what
 * the app serves and what its docblock and the runbook advertise — see the
 * comment on HELIUS_URL.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { resetChainSecretsCache } from '@server/chains/secrets'
import { TEST_DB_CONFIGURED, TEST_CHAIN_ID_ALT, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const SOLANA_SECRET = 'helius-shared-secret'
const EVM_SECRET = 'alchemy-signing-secret'

/**
 * A chain resolves ALL-OR-NOTHING: the loader collects an error and throws when
 * a chain has some keys but not its required ones ("partially configured"), so
 * setting only WEBHOOK_SECRET does not give a configured chain, it gives a 500.
 * Both maps therefore carry each namespace's full required set from schema.ts.
 */
const SOLANA_ENV: Record<string, string> = {
  CHAIN_SOLANA_DEVNET_RPC_URL: 'https://api.devnet.solana.example',
  CHAIN_SOLANA_DEVNET_TREASURY_ADDR: '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1',
  CHAIN_SOLANA_DEVNET_WEBHOOK_SECRET: SOLANA_SECRET,
}

const EVM_ENV: Record<string, string> = {
  CHAIN_EIP155_84532_RPC_URL: 'https://base-sepolia.example/rpc',
  CHAIN_EIP155_84532_ESCROW_ADDR: '0x1111111111111111111111111111111111111111',
  CHAIN_EIP155_84532_TREASURY_ADDR: '0x2222222222222222222222222222222222222222',
  CHAIN_EIP155_84532_WEBHOOK_SECRET: EVM_SECRET,
}

/** Apply an env patch and drop the secrets cache so the next read sees it. */
function withChainEnv(patch: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetChainSecretsCache()
}

/** Every key this file touches, cleared — so no case inherits another's state. */
function clearChainEnv(): void {
  withChainEnv(
    Object.fromEntries(
      [...Object.keys(SOLANA_ENV), ...Object.keys(EVM_ENV)].map((k) => [k, undefined]),
    ),
  )
}

afterEach(clearChainEnv)

/**
 * The documented path, and since #106 the served one.
 *
 * When this file was written the route was mounted at the bare `/v1/webhooks`:
 * @fastify/autoload prefixes a DIRECTORY with its name and a bare FILE inherits
 * only its parent's, so helius.ts's `post('/')` landed a level up while its
 * three sibling providers — all directories — were namespaced. That was a
 * RECURRENCE of the drift routes/v1/blockchain/index.ts was written to fix, and
 * the mount is now pinned the same way: routes/v1/webhooks/index.ts registers
 * this module explicitly, and webhook-routes.test.ts asserts the four provider
 * paths exist and the bare prefix does not.
 */
const HELIUS_URL = '/v1/webhooks/helius'

function heliusPost(
  app: ReturnType<typeof getApp>,
  authorization: string | undefined,
  body: Array<Record<string, unknown>>,
) {
  return app.inject({
    method: 'POST',
    url: HELIUS_URL,
    headers: authorization === undefined ? {} : { authorization },
    payload: body,
  })
}

function alchemyPost(app: ReturnType<typeof getApp>, raw: string, signature: string | null) {
  return app.inject({
    method: 'POST',
    url: '/v1/webhooks/alchemy',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'x-alchemy-signature': signature }),
    },
    payload: raw,
  })
}

const TX_HASH = `0x${'a'.repeat(64)}`

// ---------- Helius (Solana) --------------------------------------------------

test('helius webhook: no configured secret is 503, not an open door', { skip }, async () => {
  // The refusal that fires today for every request, because the harness sets no
  // chain webhook secret. 503 rather than 500 is deliberate: polling and
  // reconciliation still converge while the hook is dark.
  const app = getApp()
  clearChainEnv()

  const res = await heliusPost(app, SOLANA_SECRET, [{ signature: 'sig-1' }])
  assert.strictEqual(res.statusCode, 503)
  assert.match(res.json().message, /Helius webhook not configured/)
})

test('helius webhook: a missing or wrong Authorization header is 401', { skip }, async () => {
  // The authenticity boundary. A near-miss and a length-mismatch are both here
  // because the comparison is timing-safe and length-guarded — two different
  // ways to fail one check.
  const app = getApp()
  withChainEnv(SOLANA_ENV)

  for (const header of [undefined, '', 'wrong', `${SOLANA_SECRET}x`, SOLANA_SECRET.slice(0, -1)]) {
    const res = await heliusPost(app, header, [{ signature: 'sig-1' }])
    assert.strictEqual(res.statusCode, 401, String(header))
    assert.match(res.json().message, /authorization mismatch/)
  }
})

test('helius webhook: the exact secret is accepted and the payload is counted', { skip }, async () => {
  // The control: without it every refusal above is satisfiable by a handler that
  // rejects everything. Also pins that signatures are EXTRACTED, so a 401 fix
  // that broke parsing would show up.
  const app = getApp()
  withChainEnv(SOLANA_ENV)

  const res = await heliusPost(app, SOLANA_SECRET, [
    { signature: 'sig-1' },
    { signature: 'sig-2' },
    { nothing: true },
  ])
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().received, 2)
})

// ---------- Alchemy (EVM) ----------------------------------------------------

test('alchemy webhook: no configured paymaster-chain secret is 503', { skip }, async () => {
  const app = getApp()
  clearChainEnv()
  const raw = JSON.stringify({ event: { activity: [{ hash: TX_HASH }] } })

  const res = await alchemyPost(app, raw, createHmac('sha256', EVM_SECRET).update(raw).digest('hex'))
  assert.strictEqual(res.statusCode, 503)
  assert.match(res.json().message, /Alchemy webhook not configured/)
})

test('alchemy webhook: a CONFIGURED chain with no webhook secret is still 503', { skip }, async () => {
  // The realistic misconfiguration, and the one the case above does not reach:
  // Base is live — rpc, escrow and treasury all set — but WEBHOOK_SECRET was
  // never added. The guard is `evm?.webhookSecret === undefined`, which covers
  // BOTH "no chain" and "chain without a secret"; clearing all the env only
  // exercises the first.
  //
  // MEASURED: a mutant that weakened the guard to `evm === undefined` (and
  // defaulted the secret to '') passed every case in this file until this one
  // existed. Without it, a deployment that forgot the secret would verify every
  // webhook against the empty string.
  const app = getApp()
  const { CHAIN_EIP155_84532_WEBHOOK_SECRET: _omitted, ...withoutSecret } = EVM_ENV
  withChainEnv(withoutSecret)
  const raw = JSON.stringify({ event: { activity: [{ hash: TX_HASH }] } })

  const res = await alchemyPost(app, raw, createHmac('sha256', '').update(raw).digest('hex'))
  assert.strictEqual(res.statusCode, 503)
  assert.match(res.json().message, /Alchemy webhook not configured/)
})

test('alchemy webhook: a signature over different bytes, or none, is 401', { skip }, async () => {
  // The tamper shape, as for the fiat webhooks in T1: a signature that is
  // perfectly valid for a body the caller has seen must not authenticate a body
  // they chose. `verifyHmac` also has to refuse a non-hex value rather than
  // throwing inside the decoder.
  const app = getApp()
  withChainEnv(EVM_ENV)
  const seen = JSON.stringify({ event: { activity: [{ hash: TX_HASH }] } })
  const tampered = JSON.stringify({ event: { activity: [{ hash: `0x${'b'.repeat(64)}` }] } })
  const sign = (s: string, secret = EVM_SECRET) => createHmac('sha256', secret).update(s).digest('hex')

  const cases: Array<[string, string | null]> = [
    [tampered, sign(seen)], // right secret, wrong bytes
    [seen, sign(seen, 'not-the-secret')], // wrong secret
    [seen, 'not-hex'], // undecodable
    [seen, null], // absent
  ]
  for (const [body, signature] of cases) {
    const res = await alchemyPost(app, body, signature)
    assert.strictEqual(res.statusCode, 401, String(signature))
    assert.match(res.json().message, /signature mismatch/)
  }
})

test('alchemy webhook: a correctly signed payload is accepted and hashes counted', { skip }, async () => {
  // The control, and it also proves the chain the handler resolves is the one
  // the registry carries — `chains.has(evm.chainId)` sits between the signature
  // check and the enqueue.
  const app = getApp()
  withChainEnv(EVM_ENV)
  assert.ok(getApp().chains.has(TEST_CHAIN_ID_ALT), 'the fake registry must carry the paymaster chain')

  const raw = JSON.stringify({ event: { activity: [{ hash: TX_HASH }, { hash: 'not-a-hash' }] } })
  const res = await alchemyPost(app, raw, createHmac('sha256', EVM_SECRET).update(raw).digest('hex'))
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().received, 1)
})

/**
 * NOT COVERED HERE, deliberately, and recorded rather than forced:
 *
 *   helius.ts:60  'no solana adapter registered'
 *   alchemy:75    'BASE adapter not registered'
 *
 * Both fire when the chain SECRETS and the adapter REGISTRY disagree — a secret
 * resolves for a chain the running registry does not carry. The harness builds
 * its registry from the same manifest, and the fake registry always carries both
 * solana:devnet and eip155:84532, so within this app the two can never
 * disagree. Reaching them would mean substituting a registry that omits a chain
 * whose secret is set, which tests the substitution rather than the product.
 * They are defence-in-depth against a registry-construction bug and belong with
 * whatever proves that construction, not here.
 */
