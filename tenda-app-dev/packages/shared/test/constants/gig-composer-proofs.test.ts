/**
 * constants/gig-composer-proofs — the composer's proof-param editor state:
 * building wire params from the draft, the submit derivation, and the
 * delivery-step validation both clients run. The scoping rule is the
 * load-bearing one: params leave the composer only for SELECTED types,
 * because the server refuses params for a type the gig does not require.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  buildProofParams,
  composerProofSubmission,
  draftFromProofParams,
  draftRadiusM,
  emptyProofParamsDraft,
  emptyStructuredFieldDraft,
  proofSetupProblem,
  type ProofParamsDraft,
} from '../../src/constants/gig-composer-proofs'
import {
  DEFAULT_GEOTAG_RADIUS_M,
  MAX_GEOTAG_RADIUS_M,
  MIN_GEOTAG_RADIUS_M,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
  parseProofParams,
} from '../../src/constants/proof-params'

const PIN = { latitude: 6.5244, longitude: 3.3792 }

function draft(over: Partial<ProofParamsDraft> = {}): ProofParamsDraft {
  return { ...emptyProofParamsDraft(), ...over }
}

// ---------- draft plumbing --------------------------------------------------

test('the empty draft seeds a radius the server would accept', () => {
  const empty = emptyProofParamsDraft()
  assert.equal(empty.pin, null)
  assert.deepEqual(empty.fields, [])
  assert.equal(draftRadiusM(empty), DEFAULT_GEOTAG_RADIUS_M)
  assert.ok(DEFAULT_GEOTAG_RADIUS_M >= MIN_GEOTAG_RADIUS_M)
  assert.ok(DEFAULT_GEOTAG_RADIUS_M <= MAX_GEOTAG_RADIUS_M)
})

test('a new structured field row starts required with the string kind', () => {
  assert.deepEqual(emptyStructuredFieldDraft(), { name: '', kind: 'string', required: true })
})

test('draftRadiusM parses only whole non-negative numbers', () => {
  assert.equal(draftRadiusM(draft({ radiusText: ' 250 ' })), 250)
  for (const text of ['', 'abc', '2.5', '-10', '1e3']) {
    assert.equal(draftRadiusM(draft({ radiusText: text })), null, text)
  }
})

test('draftFromProofParams rebuilds a repost draft, defaults included', () => {
  const rebuilt = draftFromProofParams(
    {
      geotag: { radius_m: 120 },
      structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
    },
    PIN.latitude,
    PIN.longitude,
  )
  assert.deepEqual(rebuilt.pin, PIN)
  assert.equal(rebuilt.radiusText, '120')
  assert.deepEqual(rebuilt.fields, [{ name: 'count', kind: 'number', required: true }])
  // No stored params / no stored pin — the fresh-form defaults come back.
  const fresh = draftFromProofParams(null, null, null)
  assert.deepEqual(fresh, emptyProofParamsDraft())
})

// ---------- buildProofParams scoping ----------------------------------------

test('params are built ONLY for the selected param-bearing types', () => {
  const full = draft({
    pin: PIN,
    radiusText: '300',
    fields: [{ name: ' count ', kind: 'number', required: false }],
  })
  assert.deepEqual(buildProofParams(['geotag'], full), { geotag: { radius_m: 300 } })
  assert.deepEqual(buildProofParams(['structured'], full), {
    structured: { fields: [{ name: 'count', kind: 'number', required: false }] },
  })
  assert.deepEqual(buildProofParams(['geotag', 'structured'], full), {
    geotag: { radius_m: 300 },
    structured: { fields: [{ name: 'count', kind: 'number', required: false }] },
  })
  // Editor residue for a DESELECTED type must never reach the wire — the
  // server refuses params for a type the gig does not require.
  assert.equal(buildProofParams(['image', 'text'], full), null)
  assert.equal(buildProofParams([], full), null)
})

// ---------- composerProofSubmission -----------------------------------------

test('the pin travels only when a geotag proof will be verified against it', () => {
  const withPin = draft({ pin: PIN })
  assert.deepEqual(composerProofSubmission(['geotag'], withPin), {
    latitude: PIN.latitude,
    longitude: PIN.longitude,
    proofParams: { geotag: { radius_m: DEFAULT_GEOTAG_RADIUS_M } },
  })
  // Geotag deselected: captured pin residue stays home.
  assert.deepEqual(composerProofSubmission(['image'], withPin), {
    latitude: null,
    longitude: null,
    proofParams: null,
  })
  // Geotag selected but nothing captured yet: nulls, never NaN or undefined.
  assert.deepEqual(composerProofSubmission(['geotag'], draft()).latitude, null)
})

// ---------- proofSetupProblem -----------------------------------------------

test('no param-bearing requirement means nothing can be missing', () => {
  assert.equal(proofSetupProblem([], false, draft()), null)
  assert.equal(proofSetupProblem(['image', 'video', 'document', 'text'], true, draft()), null)
})

test('geotag on a remote gig is refused with both ways out named', () => {
  assert.match(
    proofSetupProblem(['geotag'], true, draft({ pin: PIN })) ?? '',
    /needs a physical gig/,
  )
})

test('geotag demands a pin, then a radius inside the shared bounds', () => {
  assert.equal(
    proofSetupProblem(['geotag'], false, draft()),
    'Set the check-in point for the location proof',
  )
  for (const radiusText of ['', 'abc', String(MIN_GEOTAG_RADIUS_M - 1), String(MAX_GEOTAG_RADIUS_M + 1)]) {
    assert.equal(
      proofSetupProblem(['geotag'], false, draft({ pin: PIN, radiusText })),
      `Check-in radius must be ${MIN_GEOTAG_RADIUS_M} to ${MAX_GEOTAG_RADIUS_M} metres`,
      radiusText,
    )
  }
  assert.equal(proofSetupProblem(['geotag'], false, draft({ pin: PIN, radiusText: '250' })), null)
})

test('structured demands at least one field, then defers to the server rules', () => {
  assert.equal(
    proofSetupProblem(['structured'], false, draft()),
    'Add at least one field for the worker to report',
  )
  // Field-level problems surface in parseProofParams's own words.
  assert.match(
    proofSetupProblem(['structured'], false, draft({ fields: [emptyStructuredFieldDraft()] })) ?? '',
    /structured field names must be 1-\d+ characters/,
  )
  const count = { name: 'count', kind: 'number', required: true } as const
  assert.match(
    proofSetupProblem(['structured'], false, draft({ fields: [count, { ...count }] })) ?? '',
    /declared twice/,
  )
  assert.match(
    proofSetupProblem(
      ['structured'],
      false,
      draft({ fields: [{ ...count, name: 'x'.repeat(MAX_STRUCTURED_FIELD_NAME_LENGTH + 1) }] }),
    ) ?? '',
    /structured field names must be/,
  )
  assert.equal(proofSetupProblem(['structured'], false, draft({ fields: [count] })), null)
})

test('a complete two-type setup is publishable and both problems are reported first-wins', () => {
  const complete = draft({ pin: PIN, fields: [{ name: 'count', kind: 'number', required: true }] })
  assert.equal(proofSetupProblem(['geotag', 'structured'], false, complete), null)
  // Geotag's problem outranks structured's — the step walks top to bottom.
  assert.equal(
    proofSetupProblem(['geotag', 'structured'], false, draft()),
    'Set the check-in point for the location proof',
  )
})

test('an unparseable radius builds NaN — the sentinel parseProofParams refuses, never a number the server would store', () => {
  // buildProofParams is also reached from composerProofSubmission, which a
  // caller can invoke without proofSetupProblem having run first. NaN (not 0,
  // not the default) is what leaves it, so the wire can never carry a radius
  // the poster did not type.
  const params = buildProofParams(['geotag'], draft({ pin: PIN, radiusText: 'abc' }))
  assert.ok(params !== null && params.geotag !== undefined)
  assert.ok(Number.isNaN(params.geotag.radius_m))
  assert.match(parseProofParams(['geotag'], params).error ?? '', /radius_m must be an integer/)
})
