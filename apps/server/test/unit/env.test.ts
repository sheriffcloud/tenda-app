/**
 * lib/env.ts — the two rules every env reader agrees on: blank means absent,
 * and a URL from env must be genuinely absolute. The URL cases that matter are
 * the ones plain `new URL()` accepts; this helper exists to reject those.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { isAbsoluteUrl, optionalEnv, stripTrailingSlash, urlEnvProblems } from '@server/lib/env'

const HTTPS = ['https'] as const
const HTTP_S = ['https', 'http'] as const

// ── optionalEnv ────────────────────────────────────────────────────────────
// `env` is a parameter, so these never touch process.env.

test('optionalEnv returns the trimmed value when set', () => {
  assert.strictEqual(optionalEnv('K', { K: '  value  ' }), 'value')
})

test('optionalEnv treats unset, empty, and whitespace-only alike as absent', () => {
  // The rule that matters: a blank var must read as "not configured", never
  // as a configured empty string (that became a '' base URL once already).
  assert.strictEqual(optionalEnv('K', {}), null)
  assert.strictEqual(optionalEnv('K', { K: '' }), null)
  assert.strictEqual(optionalEnv('K', { K: '   ' }), null)
  assert.strictEqual(optionalEnv('K', { K: '\t\n' }), null)
})

test('optionalEnv defaults to process.env', () => {
  const key = 'TENDA_OPTIONAL_ENV_PROBE'
  try {
    process.env[key] = ' probe '
    assert.strictEqual(optionalEnv(key), 'probe')
  } finally {
    delete process.env[key]
  }
  assert.strictEqual(optionalEnv(key), null)
})

// ── isAbsoluteUrl ──────────────────────────────────────────────────────────

test('isAbsoluteUrl accepts a well-formed URL on an allowed scheme', () => {
  assert.strictEqual(isAbsoluteUrl('https://hooks.slack.com/services/T/B/x', HTTPS), true)
  assert.strictEqual(isAbsoluteUrl('https://admin.tenda.app', HTTP_S), true)
  assert.strictEqual(isAbsoluteUrl('http://localhost:3001', HTTP_S), true)
})

test('isAbsoluteUrl rejects a scheme that is not allowed', () => {
  // Parses fine, wrong scheme — an http webhook would leak dispute context.
  assert.strictEqual(isAbsoluteUrl('http://hooks.slack.com/x', HTTPS), false)
  assert.strictEqual(isAbsoluteUrl('ftp://example.com/x', HTTP_S), false)
})

test('isAbsoluteUrl rejects the missing-slashes typo that new URL() accepts', () => {
  // The reason this helper exists: `new URL` parses this happily, protocol
  // 'https:' and host 'admin.tenda.app', so a protocol-only check passes it.
  assert.strictEqual(new URL('https:admin.tenda.app/x').protocol, 'https:')
  assert.strictEqual(isAbsoluteUrl('https:admin.tenda.app/x', HTTP_S), false)
})

test('isAbsoluteUrl rejects unparseable and non-absolute values', () => {
  assert.strictEqual(isAbsoluteUrl('https://[', HTTPS), false)     // parse throws
  assert.strictEqual(isAbsoluteUrl('https://', HTTPS), false)      // no host
  assert.strictEqual(isAbsoluteUrl('admin.tenda.app', HTTP_S), false)
  assert.strictEqual(isAbsoluteUrl('/disputes/1', HTTP_S), false)
  assert.strictEqual(isAbsoluteUrl('', HTTP_S), false)
})

test('isAbsoluteUrl is scheme-case-insensitive', () => {
  assert.strictEqual(isAbsoluteUrl('HTTPS://hooks.slack.com/x', HTTPS), true)
})

test('isAbsoluteUrl rejects everything when no scheme is allowed', () => {
  assert.strictEqual(isAbsoluteUrl('https://admin.tenda.app', []), false)
})

// ── urlEnvProblems ─────────────────────────────────────────────────────────
// The loud half every boot check shares: absent is silence, malformed is not.

test('urlEnvProblems: no problems when vars are absent, blank, or valid', () => {
  assert.deepStrictEqual(urlEnvProblems(['A', 'B'], HTTPS, {}), [])
  assert.deepStrictEqual(urlEnvProblems(['A'], HTTPS, { A: '   ' }), [])
  assert.deepStrictEqual(urlEnvProblems(['A'], HTTPS, { A: 'https://ok.example' }), [])
})

test('urlEnvProblems: names the exact env key and the schemes it wanted', () => {
  assert.deepStrictEqual(urlEnvProblems(['A'], HTTPS, { A: 'http://x' }), [
    'A is set but is not an absolute https URL',
  ])
  assert.deepStrictEqual(urlEnvProblems(['A'], HTTP_S, { A: 'ftp://x' }), [
    'A is set but is not an absolute https or http URL',
  ])
})

test('urlEnvProblems: reports every bad var, not just the first', () => {
  // Boot aggregates problems so an operator fixes them in one pass.
  assert.deepStrictEqual(urlEnvProblems(['A', 'B'], HTTPS, { A: 'nope', B: 'also-nope' }), [
    'A is set but is not an absolute https URL',
    'B is set but is not an absolute https URL',
  ])
})

test('urlEnvProblems: accepts any iterable of keys (Set, as the Slack registry returns)', () => {
  assert.deepStrictEqual(urlEnvProblems(new Set(['A']), HTTPS, { A: 'nope' }), [
    'A is set but is not an absolute https URL',
  ])
})

// ── stripTrailingSlash ─────────────────────────────────────────────────────

test('stripTrailingSlash removes exactly one trailing slash', () => {
  assert.strictEqual(stripTrailingSlash('https://admin.tenda.app/'), 'https://admin.tenda.app')
  assert.strictEqual(stripTrailingSlash('https://admin.tenda.app'), 'https://admin.tenda.app')
  // Only one: '//' is a caller error, not something to silently normalise away.
  assert.strictEqual(stripTrailingSlash('https://admin.tenda.app//'), 'https://admin.tenda.app/')
  assert.strictEqual(stripTrailingSlash(''), '')
})
