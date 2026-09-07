/**
 * The wizard's two pure modules: the five-step contract (grouping + rail
 * state) and the review list.
 *
 * These are tested directly rather than only through the rendered wizard
 * because they are where a grouping mistake hides — a step that asks for
 * nothing, or a rail that ticks a step the submit path still rejects, both
 * render perfectly.
 */
import { describe, expect, test } from 'vitest'
import { GIG_REQUIREMENTS, emptyProofParamsDraft, type GigValidationValues } from '@tenda/shared'
import {
  WIZARD_STEPS,
  firstUnsatisfiedStep,
  stepCounter,
  wizardRailState,
  wizardStepMissingRequirement,
} from '../wizard-steps'
import { buildReviewRows, reviewAcceptDeadline, reviewPlace } from '../steps/review-rows'

const BLANK: GigValidationValues = {
  title: '',
  description: '',
  category: null,
  remote: true,
  country: null,
  city: null,
  asset: 'USDC_SOL',
  paymentRaw: '',
  completionDuration: 86_400,
  proofRequirements: [],
  proofDraft: emptyProofParamsDraft(),
}

const FILLED: GigValidationValues = {
  ...BLANK,
  title: 'Deliver a package',
  description: 'Collect and deliver safely.',
  category: 'delivery',
  paymentRaw: '10000000',
}

describe('the five-step contract', () => {
  test('is five steps with unique keys, in the comp’s rail order', () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual([
      'category',
      'brief',
      'where',
      'proof',
      'money',
    ])
  })

  test('counts steps from one, for readers rather than for arrays', () => {
    expect(stepCounter(0)).toBe('Step 1 of 5')
    expect(stepCounter(4)).toBe('Step 5 of 5')
  })

  test('every field the composer collects is claimed by exactly one step', () => {
    // Two halves, and the first one used to be missing. A field on NO step can
    // never be filled: the last step judges the whole form, so an unclaimed
    // requirement would block signing while `firstUnsatisfiedStep` answered
    // null and the hint named no step to go back to. A field on TWO steps
    // would be asked for twice and reported by whichever came first.
    const all = WIZARD_STEPS.flatMap((s) => s.requirements)
    expect(new Set(all)).toEqual(new Set(Object.values(GIG_REQUIREMENTS)))
    expect(new Set(all).size).toBe(all.length)
  })

  test('names each step’s own missing requirement, in reading order', () => {
    expect(wizardStepMissingRequirement(0, BLANK)).toBe('Pick a category')
    expect(wizardStepMissingRequirement(1, BLANK)).toBe('Add a title')
    expect(wizardStepMissingRequirement(1, { ...BLANK, title: 'x' })).toBe('Add a description')
    expect(wizardStepMissingRequirement(4, BLANK)).toBe('Set a budget')
  })

  test('a remote gig needs no place; a physical one needs country then city', () => {
    expect(wizardStepMissingRequirement(2, { ...FILLED, remote: true })).toBeNull()
    expect(wizardStepMissingRequirement(2, { ...FILLED, remote: false })).toBe('Select a country')
    expect(wizardStepMissingRequirement(2, { ...FILLED, remote: false, country: 'NG' })).toBe(
      'Select a city',
    )
  })

  test('the proof step asks for nothing — an empty list is a valid answer', () => {
    expect(wizardStepMissingRequirement(3, BLANK)).toBeNull()
  })

  test('an index past the end is not a requirement, it is a bug elsewhere', () => {
    expect(wizardStepMissingRequirement(99, BLANK)).toBeNull()
  })
})

describe('rail state', () => {
  test('marks the current step, and only the current step', () => {
    expect(wizardRailState(1, 1, FILLED).current).toBe(true)
    expect(wizardRailState(0, 1, FILLED).current).toBe(false)
  })

  test('ticks an earlier step only while it still passes', () => {
    expect(wizardRailState(0, 2, FILLED).done).toBe(true)
    // Walked back, emptied the category: the tick must come off.
    expect(wizardRailState(0, 2, { ...FILLED, category: null }).done).toBe(false)
  })

  test('never ticks a step the reader has not reached yet', () => {
    expect(wizardRailState(3, 1, FILLED).done).toBe(false)
  })

  test('locks what is ahead until the current step is satisfied', () => {
    expect(wizardRailState(2, 1, BLANK).locked).toBe(true)
    expect(wizardRailState(2, 1, FILLED).locked).toBe(false)
    // Behind the reader is never locked, satisfied or not — that is the only
    // way back to fix it.
    expect(wizardRailState(0, 1, BLANK).locked).toBe(false)
  })
})

describe('the blocking step', () => {
  test('names the earliest step still missing something', () => {
    expect(firstUnsatisfiedStep(BLANK)).toBe(0)
    expect(firstUnsatisfiedStep({ ...BLANK, category: 'delivery' })).toBe(1)
  })

  test('is null once every step is satisfied', () => {
    expect(firstUnsatisfiedStep(FILLED)).toBeNull()
  })

  test('reaches past the skippable proof step to the money step', () => {
    // Proof asks for nothing, so it must never be reported as the blocker.
    expect(firstUnsatisfiedStep({ ...FILLED, paymentRaw: '' })).toBe(4)
  })
})

describe('the review list', () => {
  const INPUT = {
    category: 'delivery' as const,
    remote: true,
    country: null,
    city: null,
    acceptDeadlineHours: 168,
    completionDuration: 86_400,
    proofRequirements: [],
    requiresApproval: false,
    networkLabel: 'Solana',
  }

  test('says Remote rather than an empty place', () => {
    expect(reviewPlace({ remote: true, country: 'NG', city: 'Lagos' })).toBe('Remote')
  })

  test('names a physical place city-first, the way the feed shows it', () => {
    expect(reviewPlace({ remote: false, country: 'NG', city: 'Lagos' })).toBe('Lagos, NG')
  })

  test('says Not set rather than an empty string when a physical gig has neither', () => {
    expect(reviewPlace({ remote: false, country: null, city: null })).toBe('Not set')
  })

  test('carries the real place into the Where row, not just the remote case', () => {
    // Every other fixture here is remote, so a row hardcoded to 'Remote'
    // survived mutation: the wiring from the row to reviewPlace was unproven
    // for a physical gig, which is the case a poster is most likely to check.
    const rows = buildReviewRows({ ...INPUT, remote: false, country: 'NG', city: 'Lagos' })
    expect(rows.find((r) => r.label === 'Where')?.value).toBe('Lagos, NG')
  })

  test('shows an unknown deadline as hours instead of the nearest label', () => {
    // Snapping to a neighbouring option would tell the reader they chose
    // something they did not.
    expect(reviewAcceptDeadline(37)).toBe('37h')
  })

  test('reads an empty proof list as the choice it is', () => {
    const rows = buildReviewRows(INPUT)
    expect(rows.find((r) => r.label === 'Proof')?.value).toBe('Any evidence')
  })

  test('lists the chosen proof types in the shared wording', () => {
    const rows = buildReviewRows({ ...INPUT, proofRequirements: ['image', 'document'] })
    expect(rows.find((r) => r.label === 'Proof')?.value).toBe('photo and document')
  })

  test('distinguishes the two acceptance modes', () => {
    expect(buildReviewRows(INPUT).find((r) => r.label === 'Who can take it')?.value).toBe(
      'First qualified worker',
    )
    expect(
      buildReviewRows({ ...INPUT, requiresApproval: true }).find(
        (r) => r.label === 'Who can take it',
      )?.value,
    ).toBe('You approve an applicant')
  })

  test('never restates the money — that has one source, above it', () => {
    const labels = buildReviewRows(INPUT).map((r) => r.label)
    expect(labels).not.toContain('Budget')
    expect(labels).not.toContain('Amount')
  })

  test('says Not set for a category rather than rendering undefined', () => {
    expect(buildReviewRows({ ...INPUT, category: null })[0].value).toBe('Not set')
  })
})
