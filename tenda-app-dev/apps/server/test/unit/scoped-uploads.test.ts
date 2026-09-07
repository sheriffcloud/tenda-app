/**
 * lib/uploads/scoped — pure folder + attachment-URL helpers for the scoped
 * upload registry (chat, dispute). The `authorize` half is DB-backed and
 * exercised by the integration suites; here we pin the path construction and
 * the strict URL check that stops a signature being replayed cross-scope.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'

import { scopedUploadFolder, isValidScopedAttachmentUrl } from '@server/lib/uploads/scoped'

test('scopedUploadFolder: <base>/<scopeId>/<userId> per type', () => {
  assert.strictEqual(scopedUploadFolder('chat', 'conv-1', 'user-1'), 'tenda/chat/conv-1/user-1')
  assert.strictEqual(scopedUploadFolder('dispute', 'escrow-1', 'user-1'), 'tenda/dispute/escrow-1/user-1')
})

test('isValidScopedAttachmentUrl (chat): exact folder in PATH only', () => {
  const good = 'https://res.cloudinary.com/demo/image/upload/v1/tenda/chat/conv-1/user-1/x.jpg'
  assert.strictEqual(isValidScopedAttachmentUrl('chat', good, 'conv-1', 'user-1'), true)
  // Wrong conversation / wrong sender.
  assert.strictEqual(isValidScopedAttachmentUrl('chat', good, 'conv-2', 'user-1'), false)
  assert.strictEqual(isValidScopedAttachmentUrl('chat', good, 'conv-1', 'user-2'), false)
  // A chat URL must not validate as a dispute URL (cross-type replay).
  assert.strictEqual(isValidScopedAttachmentUrl('dispute', good, 'conv-1', 'user-1'), false)
})

test('isValidScopedAttachmentUrl (dispute): scoped to escrow + sender', () => {
  const good = 'https://res.cloudinary.com/demo/image/upload/v1/tenda/dispute/escrow-1/user-1/e.pdf'
  assert.strictEqual(isValidScopedAttachmentUrl('dispute', good, 'escrow-1', 'user-1'), true)
  assert.strictEqual(isValidScopedAttachmentUrl('dispute', good, 'escrow-2', 'user-1'), false)
})

test('isValidScopedAttachmentUrl: host/protocol/query-string fakes rejected', () => {
  const folder = 'tenda/chat/conv-1/user-1'
  // Folder smuggled into the query string, real path elsewhere.
  const queryFake = `https://res.cloudinary.com/demo/image/upload/v1/elsewhere/x.jpg?p=/${folder}/`
  assert.strictEqual(isValidScopedAttachmentUrl('chat', queryFake, 'conv-1', 'user-1'), false)
  // Wrong host.
  assert.strictEqual(
    isValidScopedAttachmentUrl('chat', `https://evil.example/${folder}/x.jpg`, 'conv-1', 'user-1'),
    false,
  )
  // Non-https.
  assert.strictEqual(
    isValidScopedAttachmentUrl('chat', `http://res.cloudinary.com/d/${folder}/x.jpg`, 'conv-1', 'user-1'),
    false,
  )
  // Not a URL at all.
  assert.strictEqual(isValidScopedAttachmentUrl('chat', 'not a url', 'conv-1', 'user-1'), false)
})
