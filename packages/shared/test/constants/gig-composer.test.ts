/**
 * The gig composer's cross-client validation contract (moved from mobile's
 * gig-composer.steps test): first actionable requirement per step, the
 * remote-location exemption, and the whole-form recheck before submission.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { MAX_COMPLETION_DURATION_SECONDS } from '../../src/utils/validation'
import { durationRangeLabel } from '../../src/utils/gig-duration'
import {
  getGigMissingRequirement,
  getGigStepMissingRequirement,
} from '../../src/constants/gig-composer'
import { emptyProofParamsDraft } from '../../src/constants/gig-composer-proofs'
import type { ProofType } from '../../src/constants/proofs'

const VALID = {
  title: 'Deliver a package',
  description: 'Collect and safely deliver the parcel.',
  category: 'delivery' as const,
  remote: false,
  country: 'NG',
  city: 'Lagos',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
  completionDuration: 86_400,
  proofRequirements: [] as ProofType[],
  proofDraft: emptyProofParamsDraft(),
}

test('reports the first actionable details requirement', () => {
  assert.strictEqual(getGigStepMissingRequirement('details', { ...VALID, category: null }), 'Pick a category')
  assert.strictEqual(getGigStepMissingRequirement('details', { ...VALID, title: ' ' }), 'Add a title')
  assert.strictEqual(getGigStepMissingRequirement('details', { ...VALID, description: '' }), 'Add a description')
  assert.strictEqual(getGigStepMissingRequirement('details', { ...VALID, country: null }), 'Select a country')
  assert.strictEqual(getGigStepMissingRequirement('details', { ...VALID, city: null }), 'Select a city')
})

test('does not require a location for remote work', () => {
  assert.strictEqual(
    getGigStepMissingRequirement('details', { ...VALID, remote: true, country: null, city: null }),
    null,
  )
})

test('validates payment independently from details', () => {
  assert.strictEqual(getGigStepMissingRequirement('payment', { ...VALID, paymentRaw: '' }), 'Set a budget')
  // Both of these used to answer 'Set a delivery time'. They are values a
  // reader HAS set — one second, and 90 days plus one — so since #36 they are
  // told what the legal window is instead of being asked for a window again.
  assert.strictEqual(
    getGigStepMissingRequirement('payment', { ...VALID, completionDuration: 1 }),
    `Delivery time must be ${durationRangeLabel()}`,
  )
  assert.strictEqual(
    getGigStepMissingRequirement('payment', {
      ...VALID,
      completionDuration: MAX_COMPLETION_DURATION_SECONDS + 1,
    }),
    `Delivery time must be ${durationRangeLabel()}`,
  )
  assert.strictEqual(getGigStepMissingRequirement('payment', VALID), null)
})

test('rechecks the complete form before final submission', () => {
  assert.strictEqual(getGigMissingRequirement(VALID), null)
  assert.strictEqual(getGigMissingRequirement({ ...VALID, title: '' }), 'Add a title')
  assert.strictEqual(getGigMissingRequirement({ ...VALID, paymentRaw: '' }), 'Set a budget')
})

test('the duration requirement distinguishes "none yet" from "out of range"', () => {
  // Both used to read 'Set a delivery time', so a reader who had just typed
  // 91 days was told to enter something they had entered (#36).
  assert.strictEqual(
    getGigStepMissingRequirement('payment', { ...VALID, completionDuration: 0 }),
    'Set a delivery time',
  )
  assert.strictEqual(
    getGigStepMissingRequirement('payment', {
      ...VALID,
      completionDuration: MAX_COMPLETION_DURATION_SECONDS + 1,
    }),
    `Delivery time must be ${durationRangeLabel()}`,
  )
})

test('the delivery step blocks on incomplete proof params and no other field', () => {
  // File-type requirements take no params: nothing on this step can be missing.
  assert.strictEqual(
    getGigStepMissingRequirement('delivery', { ...VALID, proofRequirements: ['image', 'text'] }),
    null,
  )
  // A geotag requirement without its pin blocks the step — and the whole form.
  const geotag = { ...VALID, proofRequirements: ['geotag'] as ProofType[] }
  assert.strictEqual(
    getGigStepMissingRequirement('delivery', geotag),
    'Set the check-in point for the location proof',
  )
  assert.strictEqual(getGigMissingRequirement(geotag), 'Set the check-in point for the location proof')
  // Satisfied once the pin exists (radius is seeded valid by the empty draft).
  assert.strictEqual(
    getGigStepMissingRequirement('delivery', {
      ...geotag,
      proofDraft: { ...emptyProofParamsDraft(), pin: { latitude: 6.5, longitude: 3.4 } },
    }),
    null,
  )
})

test('a legal window is no requirement at all, at either boundary', () => {
  for (const seconds of [3600, MAX_COMPLETION_DURATION_SECONDS]) {
    assert.strictEqual(
      getGigStepMissingRequirement('payment', { ...VALID, completionDuration: seconds }),
      null,
    )
  }
})
