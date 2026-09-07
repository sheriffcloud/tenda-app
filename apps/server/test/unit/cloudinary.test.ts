/**
 * lib/cloudinary — S5.12 signed upload constraints: per-type formats are
 * part of the signature (alphabetical string-to-sign), size guards ride
 * along for the client. Scoped types (chat, dispute) derive a per-sender
 * folder from the scope id.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { createHash } from 'node:crypto'

// getConfig() reads env lazily on first call — stub before importing the lib.
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'

import { UPLOAD_CONSTRAINTS, generateUploadSignature } from '@server/lib/cloudinary'

test('signature covers allowed_formats + folder + timestamp in alphabetical order', () => {
  const sig = generateUploadSignature('avatar')
  const expected = createHash('sha1')
    .update(
      `allowed_formats=${UPLOAD_CONSTRAINTS.avatar.allowed_formats}&folder=tenda/avatars&timestamp=${sig.timestamp}${process.env.CLOUDINARY_API_SECRET}`,
    )
    .digest('hex')
  assert.strictEqual(sig.signature, expected)
  assert.strictEqual(sig.allowed_formats, 'jpg,png,webp')
  assert.strictEqual(sig.max_file_bytes, 10 * 1024 * 1024)
})

test('proof type: pdf allowed, 10MB guard, per-user folder', () => {
  const sig = generateUploadSignature('proof', 'user-1')
  assert.strictEqual(sig.folder, 'tenda/proofs/user-1')
  assert.ok(sig.allowed_formats.includes('pdf'))
  assert.strictEqual(sig.max_file_bytes, 10 * 1024 * 1024)
})

test('chat signature requires scope; folder is per-sender', () => {
  assert.throws(() => generateUploadSignature('chat'))
  assert.throws(() => generateUploadSignature('chat', 'user-1')) // missing scopeId
  const sig = generateUploadSignature('chat', 'user-1', 'conv-1')
  assert.strictEqual(sig.folder, 'tenda/chat/conv-1/user-1')
})

test('dispute signature: scoped per escrow + sender, image + PDF, 10MB', () => {
  assert.throws(() => generateUploadSignature('dispute'))
  assert.throws(() => generateUploadSignature('dispute', 'user-1')) // missing scopeId
  const sig = generateUploadSignature('dispute', 'user-1', 'escrow-9')
  assert.strictEqual(sig.folder, 'tenda/dispute/escrow-9/user-1')
  assert.strictEqual(sig.allowed_formats, 'jpg,png,webp,pdf')
  assert.strictEqual(sig.max_file_bytes, 10 * 1024 * 1024)
})
