/**
 * lib/attachments — the three-vocabulary bridge (picker ↔ wire ↔ viewer).
 * Pure functions, no mocks.
 */
import {
  pickedToAttachmentType,
  attachmentToMediaKind,
  attachmentToMediaItem,
} from '@/lib/attachments'

describe('pickedToAttachmentType', () => {
  it('maps image → image', () => {
    expect(pickedToAttachmentType('image')).toBe('image')
  })
  it('maps document → file', () => {
    expect(pickedToAttachmentType('document')).toBe('file')
  })
  it('maps video → file (non-image collapses to file)', () => {
    expect(pickedToAttachmentType('video')).toBe('file')
  })
})

describe('attachmentToMediaKind', () => {
  it('maps image → image', () => {
    expect(attachmentToMediaKind('image')).toBe('image')
  })
  it('maps file → document', () => {
    expect(attachmentToMediaKind('file')).toBe('document')
  })
})

describe('attachmentToMediaItem', () => {
  it('builds a viewer descriptor, mapping file → document', () => {
    expect(attachmentToMediaItem('m1', 'https://cdn/x.pdf', 'file')).toEqual({
      id: 'm1',
      url: 'https://cdn/x.pdf',
      type: 'document',
    })
  })
  it('round-trips a document: picked document → file → document', () => {
    const stored = pickedToAttachmentType('document')
    expect(attachmentToMediaItem('m2', 'https://cdn/y.pdf', stored).type).toBe('document')
  })
  it('keeps images as images', () => {
    expect(attachmentToMediaItem('m3', 'https://cdn/z.jpg', 'image').type).toBe('image')
  })
})
