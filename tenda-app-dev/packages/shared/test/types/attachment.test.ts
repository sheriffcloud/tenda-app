/**
 * The attachment vocabulary is types only, so the thing worth testing is the
 * one a type cannot state by itself: that the camelCase client twins and the
 * snake_case wire columns describe the SAME attachment, field for field.
 *
 * That is precisely what broke before #43 — both clients kept private copies
 * of `UploadedAttachment`/`AttachmentPress` beside a shared `AttachmentFields`
 * that nothing tied them to, so either could have gained a field the wire
 * never carried and still type-checked.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type {
  AttachmentFields,
  AttachmentInput,
  AttachmentPress,
  MessageAttachmentType,
  UploadedAttachment,
} from '../../src/types/attachment'

/** A message row exactly as the server sends it. */
const WIRE: AttachmentFields = {
  attachment_url: 'https://res.cloudinary.com/demo/image/upload/v1/chat/a.png',
  attachment_type: 'image',
  attachment_size: 2048,
}

/** The same attachment as a client holds it before sending. */
const UPLOADED: UploadedAttachment = { url: WIRE.attachment_url!, type: 'image', size: 2048 }

test('UploadedAttachment carries the wire columns, renamed and non-null', () => {
  // A round trip in both directions: whichever side gains a field, one of
  // these two object literals stops compiling.
  const toWire: AttachmentFields = {
    attachment_url: UPLOADED.url,
    attachment_type: UPLOADED.type,
    attachment_size: UPLOADED.size,
  }
  assert.deepEqual(toWire, WIRE)

  const fromWire: UploadedAttachment | null =
    WIRE.attachment_url !== null && WIRE.attachment_type !== null && WIRE.attachment_size !== null
      ? { url: WIRE.attachment_url, type: WIRE.attachment_type, size: WIRE.attachment_size }
      : null
  assert.deepEqual(fromWire, UPLOADED)
})

test('an UploadedAttachment is a legal send request without reshaping', () => {
  const input: AttachmentInput = {
    attachment_url: UPLOADED.url,
    attachment_type: UPLOADED.type,
    attachment_size: UPLOADED.size,
  }
  assert.equal(input.attachment_type, WIRE.attachment_type)
})

test('AttachmentPress is an UploadedAttachment minus size, plus the message id', () => {
  // The viewer needs to know WHICH message it opened; it does not need bytes.
  const press: AttachmentPress = { id: 'msg-1', url: UPLOADED.url, type: UPLOADED.type }
  assert.deepEqual(Object.keys(press).sort(), ['id', 'type', 'url'])
  assert.equal(press.type, UPLOADED.type)
})

/**
 * Total over the union ON PURPOSE. A new member — 'document', 'pdf', 'video',
 * any picker or viewer word leaking into the wire vocabulary — leaves this
 * Record missing a key and stops the suite compiling.
 *
 * The obvious version, `const kinds: MessageAttachmentType[] = ['image','file']`,
 * is decorative and was caught being so: a WIDENED union still accepts a
 * narrower array, so adding 'document' to the type left it green.
 */
const EVERY_KIND: Record<MessageAttachmentType, true> = { image: true, file: true }

test('the attachment type vocabulary is the wire vocabulary — image | file, nothing else', () => {
  // The compile-time half is EVERY_KIND above (catches a widened union); this
  // is the runtime half, which catches a member renamed or added in both places.
  assert.deepEqual(Object.keys(EVERY_KIND).sort(), ['file', 'image'])
  for (const kind of Object.keys(EVERY_KIND) as MessageAttachmentType[]) {
    const press: AttachmentPress = { id: 'm', url: UPLOADED.url, type: kind }
    assert.equal(press.type, kind)
  }
})

test('the wire columns are nullable as a group — "no attachment" is all three null', () => {
  // The GUARD here is the annotation, not the assertion below: making any of
  // the three non-nullable stops this literal compiling (proved by mutation —
  // narrowing attachment_url to `string` raised 3 type errors). The runtime
  // lines only document what the literal means.
  const none: AttachmentFields = {
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
  }
  assert.equal(
    none.attachment_url === null && none.attachment_type === null && none.attachment_size === null,
    true,
  )
})
