/**
 * The shared proof sentences.
 *
 * These exist so a worker cannot be told the same fact two ways by the app,
 * the web and the server. The tests that matter here are therefore about
 * VOCABULARY — every phrase goes through `formatProofTypeList` — and about the
 * retry line's two counting rules, which are the ones that were got wrong.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  PROOF_COPY,
  checkInVerdict,
  formatMetres,
  proofParamDetail,
  proofPayloadLines,
  proofRequirementLine,
} from '../../src/constants/proof-copy'
import { formatProofTypeList } from '../../src/constants/proofs'
import type { ProofParams } from '../../src/constants/proof-params'

test('the requirement is worded by the SHARED formatter, not a local join', () => {
  // A hand-rolled comma join is exactly what this replaced: it read
  // "photo, video" where the server said "photo and video".
  assert.strictEqual(
    PROOF_COPY.required(['image', 'video']),
    `Required proof: ${formatProofTypeList(['image', 'video'])}`,
  )
  assert.match(PROOF_COPY.required(['image', 'video']), /photo and video/)
})

test('what is still needed is worded the same way', () => {
  assert.strictEqual(PROOF_COPY.stillNeeded(['video']), 'Still needed: video')
  assert.match(PROOF_COPY.stillNeeded(['image', 'video', 'document']), /photo, video and document/)
})

test('a single required type reads as itself, with no list punctuation', () => {
  assert.strictEqual(PROOF_COPY.required(['document']), 'Required proof: document')
})

test('the paragraph form states the requirement AND its status', () => {
  assert.strictEqual(
    proofRequirementLine(['image', 'video'], ['video']),
    'Required proof: photo and video. Still needed: video.',
  )
})

test('nothing missing reads as covered, not as an empty "still needed"', () => {
  assert.strictEqual(
    proofRequirementLine(['image'], []),
    'Required proof: photo. All required proof attached.',
  )
})

test('the retry line counts ROWS, and lists TYPES', () => {
  // Three photos is an ordinary batch: listing per row read
  // "Photo, Photo, Photo", so the types are deduplicated and the count carries
  // the rest.
  const line = PROOF_COPY.alreadyAttached(['image', 'image', 'video'])
  assert.match(line, /3 proofs/)
  assert.match(line, /\(photo and video\)/)
})

test('the retry line says "proofs", never "files" — a check-in was never a file', () => {
  const line = PROOF_COPY.alreadyAttached(['image', 'geotag', 'text'])
  assert.match(line, /3 proofs/)
  assert.match(line, /photo, location check-in and written answer/)
  assert.doesNotMatch(line, /file/)
})

test('the plural follows the ROW count, not the type count', () => {
  const one = PROOF_COPY.alreadyAttached(['image'])
  assert.match(one, /1 proof \(/)
  assert.match(one, /reuses it —/)

  // Two proofs of the SAME type: one type, but still "proofs" and "them".
  const two = PROOF_COPY.alreadyAttached(['image', 'image'])
  assert.match(two, /2 proofs \(/)
  assert.match(two, /reuses them —/)
})

test('the retry line orders types canonically, whatever order they arrived in', () => {
  // Through the shared normaliser, so video-then-photo and photo-then-video
  // read identically — two workers must not see the same escrow described
  // differently.
  assert.strictEqual(
    PROOF_COPY.alreadyAttached(['video', 'image']),
    PROOF_COPY.alreadyAttached(['image', 'video']),
  )
})

// ---------- proofParamDetail -------------------------------------------------

const PARAMS: ProofParams = {
  geotag: { radius_m: 1500 },
  structured: {
    fields: [
      { name: 'count', kind: 'number', required: true },
      { name: 'note', kind: 'string', required: false },
    ],
  },
}

test('the geotag detail names the radius, thousands-grouped', () => {
  assert.strictEqual(
    proofParamDetail('geotag', PARAMS),
    "Check in within 1,500 m of the gig's location",
  )
})

test('the structured detail lists the declared fields, optional ones marked', () => {
  assert.strictEqual(proofParamDetail('structured', PARAMS), 'Report: count, note (optional)')
})

test('types without params — and gigs that declared none — get no detail line', () => {
  for (const type of ['image', 'video', 'document', 'text'] as const) {
    assert.strictEqual(proofParamDetail(type, PARAMS), null, type)
  }
  assert.strictEqual(proofParamDetail('geotag', null), null)
  assert.strictEqual(proofParamDetail('structured', { geotag: { radius_m: 10 } }), null)
})

// ---------- proofPayloadLines ------------------------------------------------

test('a text payload is one unlabelled line: the answer itself', () => {
  assert.deepEqual(proofPayloadLines({ text: 'Done and dusted' }), [
    { label: null, value: 'Done and dusted' },
  ])
})

test('a geotag payload reads as coordinates at metre precision', () => {
  assert.deepEqual(proofPayloadLines({ latitude: 6.52443891, longitude: 3.37921234 }), [
    { label: null, value: '6.52444, 3.37921' },
  ])
})

test('a structured payload is one labelled line per value, booleans in words', () => {
  assert.deepEqual(
    proofPayloadLines({ values: { count: 3, note: 'left at gate', confirmed: true, sealed: false } }),
    [
      { label: 'count', value: '3' },
      { label: 'note', value: 'left at gate' },
      { label: 'confirmed', value: 'Yes' },
      { label: 'sealed', value: 'No' },
    ],
  )
})

test('the pre-accept line tells the worker what accepting commits them to', () => {
  // It belongs to the arm where NOTHING is attached yet, so it must not be
  // phrased as something being missing from an upload in progress.
  assert.match(PROOF_COPY.attachBeforeSubmit, /before you can submit/)
  assert.doesNotMatch(PROOF_COPY.attachBeforeSubmit, /still needed/i)
})

// ---------- check-in verdict + metres -----------------------------------------

test('formatMetres groups thousands and carries the unit', () => {
  assert.strictEqual(formatMetres(50_000), '50,000 m')
  assert.strictEqual(formatMetres(7), '7 m')
})

test('the verdict says IN range at the radius itself, and refused one metre past it', () => {
  // Same comparison the server makes (distance <= radius passes), so the
  // pre-submit note and the refusal can never disagree at the boundary.
  const at = checkInVerdict(500, 500)
  assert.strictEqual(at.outOfRange, false)
  assert.strictEqual(at.text, 'within range (500 m of 500 m).')
  const past = checkInVerdict(501, 500)
  assert.strictEqual(past.outOfRange, true)
  assert.match(past.text, /^501 m from the gig's point, outside the 500 m allowed\. It will be refused from here\.$/)
})

test('the save-failure fallback names proof, never files', () => {
  assert.strictEqual(PROOF_COPY.saveFailed, 'Failed to save proof')
  assert.doesNotMatch(PROOF_COPY.saveFailed, /file/)
})

test('the check-in echo uses the ONE coordinate format', () => {
  assert.strictEqual(PROOF_COPY.checkedInAt(6.52443891, 3.37921234), 'Checked in at 6.52444, 3.37921')
})
