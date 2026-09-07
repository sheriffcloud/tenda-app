/**
 * The `gone` / transient split.
 *
 * This one boolean decides whether a detail screen keeps what it is showing.
 * Both directions are bugs: classifying a network blip as `gone` blanks a good
 * screen on a lost packet, and classifying a 404 as transient is what let a
 * taken-down gig keep rendering with every action button live while
 * pull-to-refresh quietly failed behind it.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { classifyDetailLoadError } from '../../../src/utils/escrow/detail-load-error'
import { ApiClientError } from '../../../src/api/client-error'

test('404 is gone — the server will not serve this row to this caller', () => {
  const result = classifyDetailLoadError(
    new ApiClientError(404, 'Not Found', 'Gig not found', 'NOT_FOUND'),
  )
  assert.deepStrictEqual(result, { message: 'Gig not found', gone: true })
})

test('non-404 statuses are NOT gone', () => {
  const cases: [number, string][] = [
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [409, 'ESCROW_TAKEN_DOWN'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
  ]
  for (const [status, code] of cases) {
    // Only 404 empties the slot. A 403 in particular must not: the caller may
    // simply need to re-authenticate, and their screen is still valid.
    const result = classifyDetailLoadError(new ApiClientError(status, 'Error', 'nope', code))
    assert.strictEqual(result.gone, false, `HTTP ${status}`)
    assert.strictEqual(result.message, 'nope', `HTTP ${status}`)
  }
})

test('a network failure keeps its message and is never gone', () => {
  // What `fetch` throws when the device is offline or the request aborts.
  const result = classifyDetailLoadError(new TypeError('Network request failed'))
  assert.deepStrictEqual(result, { message: 'Network request failed', gone: false })
})

test('a 404 with a blank message is still gone, and still says something', () => {
  // The two halves are decided independently: a blank body must not downgrade
  // an authoritative 404 to a transient failure.
  const result = classifyDetailLoadError(new ApiClientError(404, 'Not Found', '', 'NOT_FOUND'))
  assert.strictEqual(result.gone, true)
  assert.ok(result.message.length > 0)
})

test('an Error with an empty message falls back to something showable', () => {
  // An abort can arrive with a blank message; rendering "" as the failure
  // description leaves the user with a titled error and no explanation.
  const result = classifyDetailLoadError(new Error(''))
  assert.strictEqual(result.gone, false)
  assert.ok(result.message.length > 0)
})

test('non-Error throws are transient with a generic message', () => {
  // A bare object carrying `statusCode: 404` must NOT be read as gone — only
  // the real envelope counts, or any thrown shape could blank a screen.
  const cases: [string, unknown][] = [
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { statusCode: 404 }],
  ]
  for (const [label, thrown] of cases) {
    const result = classifyDetailLoadError(thrown)
    assert.strictEqual(result.gone, false, label)
    assert.ok(result.message.length > 0, label)
  }
})
