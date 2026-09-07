/**
 * routes/v1/webhooks/helius — the pure pieces: payload signature
 * extraction (defensive against arbitrary shapes) and the timing-safe
 * auth-header comparison.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { authHeaderMatches, extractSignatures } from '@server/routes/v1/webhooks/helius'

test('extractSignatures pulls signatures from enhanced-webhook items', () => {
  assert.deepStrictEqual(
    extractSignatures([
      { signature: 'sig-1', type: 'TRANSFER' },
      { signature: 'sig-2' },
    ]),
    ['sig-1', 'sig-2'],
  )
})

test('extractSignatures tolerates garbage shapes without throwing', () => {
  assert.deepStrictEqual(extractSignatures(null), [])
  assert.deepStrictEqual(extractSignatures('not-an-array'), [])
  assert.deepStrictEqual(extractSignatures([{}, { signature: 42 }, null, 'x']), [])
  assert.deepStrictEqual(extractSignatures([{ signature: '' }]), [])
})

test('authHeaderMatches: exact match only, constant-time, absent header rejected', () => {
  assert.strictEqual(authHeaderMatches('s3cret', 's3cret'), true)
  assert.strictEqual(authHeaderMatches('s3cret-no', 's3cret'), false)
  assert.strictEqual(authHeaderMatches('S3CRET', 's3cret'), false)
  assert.strictEqual(authHeaderMatches(undefined, 's3cret'), false)
  assert.strictEqual(authHeaderMatches('', 's3cret'), false)
})
