/**
 * The two guards in lib/errors.ts, and the status they answer with (#60).
 *
 * They exist because #60 found `requireNonEmptyString` documented as 422 and
 * implemented as 400. A docstring cannot be tested, but the number it was
 * lying about can be — so if someone believes the old comment and "fixes" the
 * code to match it, this fails and sends them to the rule at the top of that
 * file rather than to a silent change in what ~everything auth-related
 * answers.
 *
 * `requireBody`'s 400 is already pinned end-to-end in
 * test/integration/malformed-body.test.ts across ten routes; that suite is
 * gated on TEST_DATABASE_URL, and these cases are not, so the contract stays
 * checked on a machine with no database.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import { AppError, requireBody, requireNonEmptyString } from '@server/lib/errors'

/**
 * Assert an AppError carrying the given status and the VALIDATION_ERROR code —
 * the code is fixed, not a parameter, because both callers are guards for that
 * one code. Returns the error so a case can go on to check its message.
 */
function assertAppError(fn: () => void, status: number): AppError {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof AppError, `expected an AppError, got ${String(err)}`)
    assert.strictEqual(err.statusCode, status)
    assert.strictEqual(err.code, ErrorCode.VALIDATION_ERROR)
    return err
  }
  throw new assert.AssertionError({ message: 'expected a throw, got a clean return' })
}

test('requireNonEmptyString refuses a missing or wrongly-typed field with 400', () => {
  // The whole point of the case: 400, not the 422 the docstring claimed until
  // #60. Every auth route reaches for this guard.
  for (const value of [undefined, null, 42, {}, [], true]) {
    const err = assertAppError(() => requireNonEmptyString(value, 'phone'), 400)
    assert.match(err.message, /^phone is required and must be a non-empty string$/)
  }
})

test('requireNonEmptyString refuses the empty string, which is a string but not a value', () => {
  // `typeof '' === 'string'`, so a length check is the only thing standing
  // between an empty field and a row written with one.
  assertAppError(() => requireNonEmptyString('', 'code'), 400)
})

test('requireNonEmptyString returns a real string unchanged', () => {
  // Including strings that are falsy-adjacent or padded: the guard rejects
  // EMPTY, not "looks unimportant".
  assert.strictEqual(requireNonEmptyString('0', 'code'), '0')
  assert.strictEqual(requireNonEmptyString(' ', 'code'), ' ')
  assert.strictEqual(requireNonEmptyString('+2348012345678', 'phone'), '+2348012345678')
})

test('requireBody refuses a missing body with 400 and passes a present one through', () => {
  for (const body of [null, undefined]) {
    const err = assertAppError(() => requireBody(body), 400)
    assert.strictEqual(err.message, 'request body is required')
  }
  // A non-object body is deliberately NOT rejected here — only null/undefined
  // crash a destructure, and the route's own field checks reject the rest.
  const body = { content: 'hi' }
  assert.strictEqual(requireBody(body), body)
  assert.strictEqual(requireBody('not an object'), 'not an object')
})

test('errorLabel names the status, and falls back rather than throwing on an unknown one', () => {
  assert.strictEqual(new AppError(400, ErrorCode.VALIDATION_ERROR, 'x').errorLabel, 'Bad Request')
  assert.strictEqual(new AppError(422, ErrorCode.VALIDATION_ERROR, 'x').errorLabel, 'Unprocessable Entity')
  assert.strictEqual(new AppError(409, ErrorCode.VALIDATION_ERROR, 'x').errorLabel, 'Conflict')
  assert.strictEqual(new AppError(799, ErrorCode.INTERNAL_ERROR, 'x').errorLabel, 'Error')
})
