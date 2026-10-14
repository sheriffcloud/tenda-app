/**
 * The shared validator behaves the way the drift guarantee assumes.
 *
 * `agent-api-drift.test.ts` validates LIVE bodies against the document's closed
 * schemas, and everything it proves rests on four ajv options in
 * test/helpers/agent-api-validator.ts. Those options had no test of their own:
 * flipping `removeAdditional` to 'all', `coerceTypes` to true, `strict` off or
 * `allErrors` off left every unit suite green — measured — because the only
 * thing exercising them needs a database.
 *
 * So the guarantee is stated here, cheaply, in terms of what must FAIL. A
 * validator that quietly strips an undocumented field or coerces a string into
 * a number would let exactly the drift the document exists to prevent through,
 * and the integration suite would keep reporting success.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { AGENT_API_DOCUMENT } from '../src'
import { agentApiAjv, strictAjv, COMPONENT_REF_PREFIX } from '../src/testing/agent-api-validator'

/** A real closed component: every key required, additionalProperties false. */
const AUTH_NONCE = `${COMPONENT_REF_PREFIX}AuthNonce`

/** The shape the route actually answers, as the document declares it. */
const valid = { nonce: 'a'.repeat(43), expires_in: 300, issued_at: new Date(0).toISOString() }

test('the component under test really is closed — otherwise the cases below prove nothing', () => {
  const schema = AGENT_API_DOCUMENT.components.schemas.AuthNonce
  assert.strictEqual(schema.additionalProperties, false)
  assert.deepStrictEqual([...(schema.required ?? [])].sort(), ['expires_in', 'issued_at', 'nonce'])
})

test('a body the document describes validates', () => {
  const validate = agentApiAjv().getSchema(AUTH_NONCE)
  assert.ok(validate, 'the component is not registered under its $ref')
  assert.strictEqual(validate(valid), true, JSON.stringify(validate.errors))
})

test('an UNDOCUMENTED field is refused, never silently stripped', () => {
  // The whole closed-schema guarantee: a wire field that reaches a client
  // before it reaches the document fails the drift suite. With
  // `removeAdditional` on, ajv would delete it and report success.
  const validate = agentApiAjv().getSchema(AUTH_NONCE)!
  const body = { ...valid, retry_after: 30 }
  assert.strictEqual(validate(body), false, 'an extra field was accepted')
  assert.ok(
    validate.errors?.some((e) => e.keyword === 'additionalProperties'),
    'refused for the wrong reason',
  )
  assert.ok('retry_after' in body, 'the validator MUTATED the body — removeAdditional is on')
})

test('a coercible type mismatch is refused, never coerced', () => {
  // `expires_in` is an integer. With `coerceTypes` on, "300" would pass and the
  // document would be describing a number the wire does not send.
  const validate = agentApiAjv().getSchema(AUTH_NONCE)!
  const body = { ...valid, expires_in: '300' }
  assert.strictEqual(validate(body), false, 'a string was accepted where an integer is documented')
  assert.strictEqual(body.expires_in, '300', 'the validator COERCED the body — coerceTypes is on')
})

test('a missing required field is refused', () => {
  const validate = agentApiAjv().getSchema(AUTH_NONCE)!
  const { expires_in: _dropped, ...without } = valid
  assert.strictEqual(validate(without), false)
  assert.ok(validate.errors?.some((e) => e.keyword === 'required'))
})

test('STRICT refuses a schema with a keyword ajv does not know', () => {
  // What `strict` buys: a typo'd or invented keyword is a DOCUMENT defect that
  // fails loudly, rather than a constraint ajv silently ignores while the
  // schema goes on reporting success. Without it this compiles fine.
  assert.throws(
    () => strictAjv().compile({ type: 'object', properties: { a: { type: 'string' } }, requiredFields: ['a'] }),
    /strict mode/i,
    'strict mode is off — an unknown keyword compiled',
  )
})

test('ALL errors are reported, not just the first', () => {
  // What `allErrors` buys: a failing drift run names the whole gap. With it
  // off ajv stops at the first violation and a reader fixes one field at a
  // time, re-running a DB-backed suite for each.
  const validate = agentApiAjv().getSchema(AUTH_NONCE)!
  const { nonce: _dropped, ...body } = valid
  assert.strictEqual(validate({ ...body, expires_in: '300', extra: true }), false)
  const keywords = new Set(validate.errors?.map((e) => e.keyword))
  assert.ok(keywords.has('required'), 'the missing field was not reported')
  assert.ok(keywords.has('type'), 'the wrong type was not reported')
  assert.ok(keywords.has('additionalProperties'), 'the extra field was not reported')
})

test('every component the document declares is registered and compiles', () => {
  // Strict mode is what makes a schema ajv refuses a DOCUMENT defect rather
  // than a validator setting to relax; this is where that bites.
  const ajv = agentApiAjv()
  const names = Object.keys(AGENT_API_DOCUMENT.components.schemas)
  assert.ok(names.length > 20, 'the document declares suspiciously few components')
  const missing = names.filter((name) => ajv.getSchema(`${COMPONENT_REF_PREFIX}${name}`) === undefined)
  assert.deepStrictEqual(missing, [], 'a component is not registered under its $ref')
})
