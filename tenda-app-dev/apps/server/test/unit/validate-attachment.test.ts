/**
 * lib/uploads/validate-attachment — shared attachment-field validation for
 * chat + dispute message POSTs. All-three-or-none, type/size bounds, and a
 * scope-folder URL check.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'

// cloudinary (imported transitively for UPLOAD_CONSTRAINTS) reads env lazily.
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'

import { validateMessageAttachment } from '@server/lib/uploads/validate-attachment'

const SCOPE = { type: 'dispute' as const, scopeId: 'escrow-1', userId: 'user-1' }
const URL_OK = 'https://res.cloudinary.com/demo/image/upload/v1/tenda/dispute/escrow-1/user-1/e.pdf'
const TEN_MB = 10 * 1024 * 1024

test('no attachment fields → null (text-only message)', () => {
  assert.strictEqual(validateMessageAttachment({}, SCOPE), null)
})

test('valid attachment → normalized object', () => {
  const out = validateMessageAttachment(
    { attachment_url: URL_OK, attachment_type: 'file', attachment_size: 1234 },
    SCOPE,
  )
  assert.deepStrictEqual(out, {
    attachment_url: URL_OK,
    attachment_type: 'file',
    attachment_size: 1234,
  })
})

test('partial fields (missing size) → throws', () => {
  assert.throws(() =>
    validateMessageAttachment({ attachment_url: URL_OK, attachment_type: 'image' }, SCOPE),
  )
})

test('bad type → throws', () => {
  assert.throws(() =>
    validateMessageAttachment(
      // @ts-expect-error deliberately invalid type for the negative test
      { attachment_url: URL_OK, attachment_type: 'video', attachment_size: 10 },
      SCOPE,
    ),
  )
})

test('size bounds: zero, negative, non-integer, over-cap all throw', () => {
  for (const size of [0, -1, 12.5, TEN_MB + 1]) {
    assert.throws(
      () => validateMessageAttachment({ attachment_url: URL_OK, attachment_type: 'file', attachment_size: size }, SCOPE),
      new RegExp('attachment_size'),
    )
  }
})

test('at-cap size is allowed', () => {
  const out = validateMessageAttachment(
    { attachment_url: URL_OK, attachment_type: 'file', attachment_size: TEN_MB },
    SCOPE,
  )
  assert.strictEqual(out?.attachment_size, TEN_MB)
})

test('URL outside the scope folder → throws (cross-escrow replay blocked)', () => {
  const otherEscrow = 'https://res.cloudinary.com/demo/image/upload/v1/tenda/dispute/escrow-2/user-1/e.pdf'
  assert.throws(() =>
    validateMessageAttachment(
      { attachment_url: otherEscrow, attachment_type: 'file', attachment_size: 10 },
      SCOPE,
    ),
  )
})
