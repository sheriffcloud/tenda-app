/**
 * lib/chat — inbox/push preview semantics, incl. S5.2 attachment-only
 * messages (empty content + placeholder).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ATTACHMENT_PREVIEW, messagePreview } from '@server/lib/chat'

test('plain content: trimmed and capped at 100 chars', () => {
  assert.strictEqual(messagePreview('  hello  ', false), 'hello')
  const long = 'x'.repeat(150)
  assert.strictEqual(messagePreview(long, false), 'x'.repeat(100))
})

test('content wins over the attachment placeholder when both present', () => {
  assert.strictEqual(messagePreview('see this', true), 'see this')
})

test('attachment-only: placeholder instead of a blank preview', () => {
  assert.strictEqual(messagePreview('', true), ATTACHMENT_PREVIEW)
  assert.strictEqual(messagePreview('   ', true), ATTACHMENT_PREVIEW)
  assert.strictEqual(messagePreview(null, true), ATTACHMENT_PREVIEW)
})

test('no content, no attachment: null (caller decides)', () => {
  assert.strictEqual(messagePreview('', false), null)
  assert.strictEqual(messagePreview(null, false), null)
})
