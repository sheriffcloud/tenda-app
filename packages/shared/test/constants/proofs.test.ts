/**
 * constants/proofs — the proof-type vocabulary shared by the DB enum, the
 * server validator and the mobile picker. Order normalisation and the
 * missing-type diff are the two behaviours the submit gate depends on, so
 * both get positive and negative coverage.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  PROOF_TYPES,
  PROOF_TYPE_LABEL,
  MAX_PROOF_REQUIREMENTS,
  isProofType,
  normaliseProofRequirements,
  missingProofTypes,
  formatProofTypeList,
  type ProofType,
} from '../../src/constants/proofs'

// ---------- isProofType ----------------------------------------------------

test('isProofType accepts every declared type', () => {
  for (const type of PROOF_TYPES) {
    assert.equal(isProofType(type), true)
  }
})

test('isProofType rejects unknown strings and non-strings', () => {
  for (const bad of ['location', 'audio', '', 'IMAGE', null, undefined, 3, {}, []]) {
    assert.equal(isProofType(bad), false, `expected ${String(bad)} to be rejected`)
  }
})

// ---------- labels ---------------------------------------------------------

test('every proof type has a non-empty label', () => {
  for (const type of PROOF_TYPES) {
    assert.ok(PROOF_TYPE_LABEL[type].length > 0, `${type} has no label`)
  }
})

test('MAX_PROOF_REQUIREMENTS matches the vocabulary size', () => {
  assert.equal(MAX_PROOF_REQUIREMENTS, PROOF_TYPES.length)
})

// ---------- normaliseProofRequirements -------------------------------------

test('normalise sorts into PROOF_TYPES order regardless of input order', () => {
  assert.deepEqual(normaliseProofRequirements(['video', 'image']), ['image', 'video'])
  assert.deepEqual(normaliseProofRequirements(['image', 'video']), ['image', 'video'])
})

test('normalise deduplicates repeated entries', () => {
  assert.deepEqual(normaliseProofRequirements(['image', 'image', 'video']), ['image', 'video'])
})

test('normalise of an empty list is empty', () => {
  assert.deepEqual(normaliseProofRequirements([]), [])
})

test('normalise is idempotent', () => {
  const once = normaliseProofRequirements(['document', 'image'])
  assert.deepEqual(normaliseProofRequirements(once), once)
})

test('two equivalent selections normalise identically', () => {
  assert.deepEqual(
    normaliseProofRequirements(['video', 'document', 'image']),
    normaliseProofRequirements(['image', 'video', 'document']),
  )
})

// ---------- missingProofTypes ----------------------------------------------

const proof = (type: ProofType) => ({ type })

test('no requirements is satisfied by nothing attached', () => {
  assert.deepEqual(missingProofTypes([], []), [])
})

test('no requirements is satisfied by anything attached', () => {
  assert.deepEqual(missingProofTypes([], [proof('image')]), [])
})

test('exact coverage leaves nothing missing', () => {
  assert.deepEqual(missingProofTypes(['image', 'video'], [proof('image'), proof('video')]), [])
})

test('partial coverage reports only what is absent', () => {
  assert.deepEqual(missingProofTypes(['image', 'video'], [proof('image')]), ['video'])
})

test('nothing attached reports every requirement', () => {
  assert.deepEqual(missingProofTypes(['image', 'document'], []), ['image', 'document'])
})

test('surplus proofs of an unrequired type do not satisfy a requirement', () => {
  assert.deepEqual(missingProofTypes(['video'], [proof('image'), proof('document')]), ['video'])
})

test('duplicates of one type satisfy that type exactly once', () => {
  assert.deepEqual(missingProofTypes(['image'], [proof('image'), proof('image')]), [])
})

test('missing preserves the requirement order it was given', () => {
  assert.deepEqual(missingProofTypes(['document', 'image'], []), ['document', 'image'])
})

// ---------- formatProofTypeList --------------------------------------------
// One formatter for the server's rejection message and the app's checklist,
// so the same requirement is never worded two different ways.

test('formats an empty list as an empty string', () => {
  assert.equal(formatProofTypeList([]), '')
})

test('formats one type with no conjunction', () => {
  assert.equal(formatProofTypeList(['image']), 'photo')
})

test('formats two types with "and"', () => {
  assert.equal(formatProofTypeList(['image', 'video']), 'photo and video')
})

test('formats three types with commas and a final "and"', () => {
  assert.equal(formatProofTypeList(['image', 'video', 'document']), 'photo, video and document')
})

test('uses the shared labels, not the raw wire values', () => {
  assert.equal(formatProofTypeList(['image']), PROOF_TYPE_LABEL.image.toLowerCase())
})

test('preserves the order it is given', () => {
  assert.equal(formatProofTypeList(['video', 'image']), 'video and photo')
})
