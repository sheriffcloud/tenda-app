/**
 * instrument.js is the pre-boot Sentry bootstrap — it lives outside src/ and
 * was never imported by any test, which is how a hardcoded DSN shipped
 * unnoticed. Pins the env contract: no SENTRY_DSN → no client (Sentry
 * disabled); DSN set → client initialized with exactly that DSN.
 *
 * Order matters: the disabled case MUST run first — Sentry.init is
 * irreversible within a process (node:test runs tests in this file
 * sequentially, and each test file gets its own process).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { createRequire } from 'node:module'
import * as Sentry from '@sentry/node'

const requireCjs = createRequire(__filename)
const INSTRUMENT_PATH = requireCjs.resolve('../../instrument.js')

function loadInstrumentFresh(): void {
  delete requireCjs.cache[INSTRUMENT_PATH]
  requireCjs(INSTRUMENT_PATH)
}

test('without SENTRY_DSN the bootstrap initializes no Sentry client', () => {
  // Empty string (not delete): dotenv never overrides keys already present in
  // process.env, so a real DSN in the local .env stays inert for this case.
  process.env.SENTRY_DSN = ''
  loadInstrumentFresh()
  assert.strictEqual(Sentry.getClient(), undefined)
})

test('with SENTRY_DSN set the client initializes with exactly that DSN', () => {
  const dsn = 'https://examplePublicKey@o0.ingest.sentry.io/0'
  process.env.SENTRY_DSN = dsn
  loadInstrumentFresh()
  const client = Sentry.getClient()
  assert.ok(client !== undefined, 'expected a Sentry client after init')
  assert.strictEqual(client.getOptions().dsn, dsn)
})
