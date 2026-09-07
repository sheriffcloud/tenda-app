/**
 * The picked-File → wire attachment-type bridge: images stay 'image',
 * everything else (PDFs included) is a 'file'.
 */
import { expect, test } from 'vitest'
import { fileToAttachmentType } from '@/lib/uploads/attachments'

test('image MIME types map to image; documents map to file', () => {
  expect(fileToAttachmentType(new File([''], 'a.png', { type: 'image/png' }))).toBe('image')
  expect(fileToAttachmentType(new File([''], 'a.webp', { type: 'image/webp' }))).toBe('image')
  expect(fileToAttachmentType(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe('file')
  expect(fileToAttachmentType(new File([''], 'noext', { type: '' }))).toBe('file')
})
