/**
 * `lib/fiat-routes` — the /v1/fiat/* feature gate and body narrowing (#105 T1).
 *
 * Three of the sweep's refusals live here and none had run: the kill switch at
 * 14, `requireStr` at 20, and `optionalStr`'s delegation to it at 27. That last
 * one is the interesting absence — every existing caller passed `undefined` or
 * `null`, so the branch that actually validates a present optional value had
 * never executed.
 *
 * WHY THE KILL SWITCH IS TESTED HERE AND NOT THROUGH A ROUTE. `getConfig()`
 * caches for the life of the process and node:test gives one process per FILE,
 * so `FIAT_RAILS_ENABLED=false` set at module scope holds for this file alone.
 * The ENABLED path needs no case of its own: every fiat integration suite runs
 * through `requireFiatRails` on the way in, so a gate stuck closed would take
 * all of them down at once.
 */
// `getConfig()` validates the whole environment on first call, so without the
// harness stubs this file fails on missing DATABASE_URL rather than exercising
// the gate. Imported for side effects, the same contract fake-chain.ts relies on.
import '../helpers/test-app/env'
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import type { AppError } from '@server/lib/errors'
import { requireFiatRails, requireStr, optionalStr } from '@server/lib/fiat-routes'

// Set before the first getConfig() call in this process — see the header.
process.env.FIAT_RAILS_ENABLED = 'false'

/** The whole surface answers one shape; only the message and status vary. */
function assertRefused(fn: () => unknown, status: number, message: RegExp): void {
  assert.throws(fn, (err: AppError) => {
    assert.strictEqual(err.statusCode, status)
    assert.match(err.message, message)
    return true
  })
}

test('requireFiatRails: the kill switch refuses the whole surface with 503', async () => {
  // A preHandler, so it rejects rather than returning — the route body never
  // runs and no provider is contacted.
  await assert.rejects(
    // The handler ignores both arguments; passing the request/reply pair would
    // mean constructing two Fastify objects to be discarded.
    requireFiatRails(...([] as unknown as Parameters<typeof requireFiatRails>)),
    (err: AppError) => {
      assert.strictEqual(err.statusCode, 503)
      assert.strictEqual(err.code, ErrorCode.FIAT_RAILS_DISABLED)
      assert.match(err.message, /fiat rails are disabled/)
      return true
    },
  )
})

test('requireStr: returns the value unchanged when it is in range', () => {
  // The control. Without it every refusal below is satisfiable by a helper that
  // throws unconditionally.
  assert.strictEqual(requireStr('field', 'abc'), 'abc')
  assert.strictEqual(requireStr('field', 'x', 1), 'x')
})

test('requireStr: refuses a non-string, naming the field', () => {
  // The field name is the whole of what a client learns — every one of these
  // answers the same 422 VALIDATION_ERROR.
  for (const bad of [undefined, null, 42, true, {}, []]) {
    assertRefused(() => requireStr('bank_code', bad), 422, /^bank_code must be a 1–200 char string$/)
  }
})

test('requireStr: refuses empty and over-length, and reports the real bound', () => {
  // The message interpolates `max`, so a caller told "1–30" must actually have
  // been measured against 30 rather than the default.
  assertRefused(() => requireStr('account_number', ''), 422, /account_number must be a 1–200/)
  assertRefused(() => requireStr('account_number', 'x'.repeat(31), 30), 422, /account_number must be a 1–30 char string/)
  // The boundary itself is legal — an off-by-one here would refuse valid input.
  assert.strictEqual(requireStr('account_number', 'x'.repeat(30), 30).length, 30)
})

test('optionalStr: absent means absent, not an error', () => {
  assert.strictEqual(optionalStr('memo', undefined), undefined)
  assert.strictEqual(optionalStr('memo', null), undefined)
})

test('optionalStr: a PRESENT value is validated like a required one', () => {
  // The arm that had never run. `optional` means "may be omitted", not "may be
  // anything" — a present-but-malformed value must still be refused, and with
  // the same message its required twin would give.
  assert.strictEqual(optionalStr('memo', 'note'), 'note')
  assertRefused(() => optionalStr('memo', 42), 422, /^memo must be a 1–200 char string$/)
  assertRefused(() => optionalStr('memo', ''), 422, /^memo must be a 1–200 char string$/)
  assertRefused(() => optionalStr('memo', 'x'.repeat(11), 10), 422, /memo must be a 1–10 char string/)
})
