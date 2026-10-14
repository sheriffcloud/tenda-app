/**
 * Provider settlement webhooks — the whole handler (#105 T1).
 *
 * `providerWebhookPlugin` mounts POST /v1/webhooks/yellowcard and
 * /v1/webhooks/onrampmoney, and until this file NOTHING executed it. The sweep
 * flagged three unexecuted refusals in it (60, 67, 73); the coverage walk then
 * showed the truth is larger — lines 58-91, the entire request handler, plus
 * the raw-body content-type parser, had never run.
 *
 * THE COVERAGE ILLUSION WORTH NAMING. `routes/v1/webhooks/yellowcard` and
 * `.../onrampmoney` each report 100% statements, branches, functions and lines.
 * Both are six-line files that re-export `providerWebhookPlugin(...)`, so their
 * 100% is the plugin being CONSTRUCTED at import. The handler it mounts is in
 * another file and was never called. A per-file percentage cannot see that.
 *
 * WHY IT MATTERS MORE THAN THE OTHER SWEEP ITEMS. Line 67 is an HMAC check over
 * the raw body, and it is the only thing between an unauthenticated caller and
 * `settleFromProvider`, which transitions a fiat intent to settled or failed.
 * Nothing proved it rejected anything.
 *
 * HOW BOTH CONFIG BRANCHES FIT IN ONE FILE. The two routes are the SAME plugin
 * with different `secretKey`s, and `getConfig()` caches per process (one process
 * per test file). Configuring only Yellow Card therefore leaves Onramp.money
 * genuinely unconfigured, so the 503 arm and the signed arms are both reachable
 * here without unsetting anything mid-run.
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

/**
 * Set BEFORE the app boots (this runs at module scope, the harness boots in its
 * `before` hook) so the lazily-loaded config picks it up. Onramp.money's key is
 * deliberately left unset — that absence is a test case below.
 */
const SECRET = 'yellowcard-test-secret'
process.env.YELLOWCARD_WEBHOOK_SECRET = SECRET

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const SIGNATURE_HEADER = 'x-signature'

/** The provider's signature: hex HMAC-SHA256 over the exact bytes sent. */
function sign(raw: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(raw).digest('hex')
}

/** POST a raw body, optionally signed. `signature: null` sends no header at all. */
function post(
  app: ReturnType<typeof getApp>,
  raw: string,
  signature: string | null,
  provider = 'yellowcard',
) {
  return app.inject({
    method: 'POST',
    url: `/v1/webhooks/${provider}`,
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { [SIGNATURE_HEADER]: signature }),
    },
    payload: raw,
  })
}

before(() => {
  // If some import had already materialised the config before the assignment
  // above, every case below would 503 and the failures would look like route
  // bugs. Fail here instead, where the reason is written down.
  assert.strictEqual(
    process.env.YELLOWCARD_WEBHOOK_SECRET,
    SECRET,
    'the webhook secret must be set before the app boots',
  )
})

test('webhook: an unconfigured provider is 503, naming itself', { skip }, async () => {
  // ONRAMPMONEY_WEBHOOK_SECRET is unset, so this route refuses before it looks
  // at the signature. Reconciliation polling still converges intents while the
  // webhook is dark, which is why this is a 503 and not a 500.
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'ref-1', status: 'completed' })

  const res = await post(app, raw, sign(raw), 'onrampmoney')
  assert.strictEqual(res.statusCode, 503)
  assert.match(res.json().message, /onrampmoney webhook not configured/)
})

test('webhook: no signature header is 401', { skip }, async () => {
  // What this case does NOT prove, measured rather than assumed: it does not
  // pin the `typeof signature !== 'string'` clause. Making that branch dead —
  // coercing an absent header to '' — leaves all nine cases here green, because
  // `verifyHmac` rejects an empty signature on its own (decodeSignature returns
  // null for a zero-length string). The two halves are belt and braces. The
  // case still earns its place: a request with no header at all must be
  // refused, whichever clause does the refusing.
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'ref-1', status: 'completed' })

  const res = await post(app, raw, null)
  assert.strictEqual(res.statusCode, 401)
  assert.match(res.json().message, /signature mismatch/)
})

test('webhook: a signature for DIFFERENT bytes is 401', { skip }, async () => {
  // The half that matters. A well-formed hex signature, correctly computed with
  // the real secret — but over a different body. This is the replay/tamper
  // shape: an attacker who has seen one valid (body, signature) pair cannot
  // reuse that signature for a payload of their own choosing.
  const app = getApp()
  const seen = JSON.stringify({ provider_ref: 'ref-1', status: 'failed' })
  const tampered = JSON.stringify({ provider_ref: 'ref-1', status: 'completed' })

  const res = await post(app, tampered, sign(seen))
  assert.strictEqual(res.statusCode, 401)
  assert.match(res.json().message, /signature mismatch/)
})

test('webhook: a signature made with the WRONG secret is 401', { skip }, async () => {
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'ref-1', status: 'completed' })

  const res = await post(app, raw, sign(raw, 'not-the-secret'))
  assert.strictEqual(res.statusCode, 401)
  assert.match(res.json().message, /signature mismatch/)
})

test('webhook: a malformed signature is 401, not a 500 from the decoder', { skip }, async () => {
  // `verifyHmac` decodes hex before comparing; a non-hex value must be refused
  // rather than throwing inside Buffer/timingSafeEqual.
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'ref-1', status: 'completed' })

  for (const bad of ['not-hex', 'abc', '', '0x']) {
    const res = await post(app, raw, bad)
    assert.strictEqual(res.statusCode, 401, bad)
  }
})

test('webhook: a signed payload with no provider_ref is 400', { skip }, async () => {
  // Past the signature, so this proves the request was authentic AND that the
  // body still has to carry the reference the settlement is keyed on.
  const app = getApp()
  const raw = JSON.stringify({ status: 'completed' })

  const res = await post(app, raw, sign(raw))
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /payload missing provider_ref/)
})

test('webhook: `ref` is accepted as the alias for provider_ref', { skip }, async () => {
  // The handler reads `provider_ref ?? ref`. Without a case the alias could be
  // dropped and only providers using the primary spelling would keep working.
  const app = getApp()
  const raw = JSON.stringify({ ref: 'unknown-ref', status: 'completed' })

  const res = await post(app, raw, sign(raw))
  assert.strictEqual(res.statusCode, 200)
})

test('webhook: a non-terminal status is acknowledged 202 without settling', { skip }, async () => {
  // Providers report many phases; only terminal ones transition an intent. 202
  // rather than 200 is how the handler says "received, nothing changed".
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'ref-1', status: 'processing' })

  const res = await post(app, raw, sign(raw))
  assert.strictEqual(res.statusCode, 202)
  assert.deepStrictEqual(res.json(), { ok: true })
})

test('webhook: a terminal status for an unknown ref is still 200', { skip }, async () => {
  // Deliberate: an unknown reference is logged and dropped with a 200 so a
  // provider's retry storm gains nothing. The control that proves the signed
  // path reaches settlement at all.
  const app = getApp()
  const raw = JSON.stringify({ provider_ref: 'no-such-ref', status: 'completed' })

  const res = await post(app, raw, sign(raw))
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { ok: true })
})
