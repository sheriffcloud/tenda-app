/**
 * DataProofInputs + StructuredProofForm — the worker's capture UI for the
 * required data types. The contract the sheet relies on: an entry is only
 * reported for a type whose capture is COMPLETE and conformant, so the
 * checklist (and therefore the submit gate) stays honest.
 */
import assert from 'node:assert'
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { ProofParams } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        border: { default: '#ddd', subtle: '#eee' },
        surface: { card: '#fff', inset: '#f4f4f4' },
        brand: { primary: '#25f', onPrimary: '#fff' },
        feedback: {
          danger: { base: '#c00', surface: '#fcc' },
          warning: { base: '#a60', surface: '#fe8' },
        },
      },
    },
  }),
}))

const mockCapture = jest.fn()
let mockError: string | null = null
jest.mock('@/hooks/useDeviceCoords', () => ({
  useDeviceCoords: () => ({ capture: mockCapture, capturing: false, error: mockError }),
}))

import { DataProofInputs } from '../data-proofs/DataProofInputs'
import { structuredFormValues } from '../data-proofs/StructuredProofForm'

const PARAMS: ProofParams = {
  geotag: { radius_m: 500 },
  structured: {
    fields: [
      { name: 'count', kind: 'number', required: true },
      { name: 'sealed', kind: 'boolean', required: true },
      { name: 'note', kind: 'string', required: false },
    ],
  },
}
const PIN = { latitude: 6.5244, longitude: 3.3792 }

beforeEach(() => {
  jest.clearAllMocks()
  mockError = null
})

test('renders nothing when no data type is required', () => {
  const { toJSON } = render(
    <DataProofInputs requirements={['image']} proofParams={null} gigPin={null} onChange={jest.fn()} />,
  )
  expect(toJSON()).toBeNull()
})

test('a check-in inside the radius reports the geotag entry and says it is in range', async () => {
  // ~157 m east of the pin at this latitude — inside 500 m.
  mockCapture.mockResolvedValue({ latitude: 6.5244, longitude: 3.3806 })
  const onChange = jest.fn()
  render(
    <DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />,
  )

  fireEvent.press(screen.getByText('Check in at my location'))
  await screen.findByText(/Checked in at/)
  expect(onChange).toHaveBeenCalledWith([
    { type: 'geotag', payload: { latitude: 6.5244, longitude: 3.3806 } },
  ])
  expect(screen.getByText(/within range/)).toBeTruthy()
})

test('an OUT-OF-RANGE check-in still reports the entry but warns it will be refused', async () => {
  // ~11 km away — far outside 500 m. Advisory only: the server is the judge,
  // and swallowing the entry would leave the worker with a dead submit and
  // no explanation.
  mockCapture.mockResolvedValue({ latitude: 6.4244, longitude: 3.3792 })
  const onChange = jest.fn()
  render(
    <DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />,
  )

  fireEvent.press(screen.getByText('Check in at my location'))
  await screen.findByText(/Checked in at/)
  expect(onChange).toHaveBeenCalledWith([
    { type: 'geotag', payload: { latitude: 6.4244, longitude: 3.3792 } },
  ])
  expect(screen.getByText(/It will be refused from here/)).toBeTruthy()
})

test('a failed capture reports nothing and surfaces the hook error', async () => {
  mockCapture.mockResolvedValue(null)
  mockError = 'Could not read your location. Try again.'
  const onChange = jest.fn()
  render(
    <DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />,
  )
  fireEvent.press(screen.getByText('Check in at my location'))
  await screen.findByText(/Could not read/)
  expect(onChange).not.toHaveBeenCalled()
})

test('the written answer reports trimmed text — and retracts when emptied', () => {
  const onChange = jest.fn()
  render(
    <DataProofInputs requirements={['text']} proofParams={null} gigPin={null} onChange={onChange} />,
  )
  const input = screen.getByPlaceholderText(/Describe what you did/)
  fireEvent.changeText(input, '  delivered to the gate  ')
  expect(onChange).toHaveBeenLastCalledWith([
    { type: 'text', payload: { text: 'delivered to the gate' } },
  ])
  // Whitespace-only is NOT an answer; the entry must go away, not linger.
  fireEvent.changeText(input, '   ')
  expect(onChange).toHaveBeenLastCalledWith([])
})

test('the structured form reports only once the value set CONFORMS', () => {
  const onChange = jest.fn()
  render(
    <DataProofInputs
      requirements={['structured']}
      proofParams={PARAMS}
      gigPin={null}
      onChange={onChange}
    />,
  )
  // Required number filled — boolean still unanswered, so nothing reports.
  // Two text inputs render (count, then the optional note); count is first.
  fireEvent.changeText(screen.getAllByDisplayValue('')[0] as never, '3')
  expect(onChange).toHaveBeenLastCalledWith([])

  // Answering the required boolean completes the set (note is optional).
  fireEvent.press(screen.getByText('Yes'))
  expect(onChange).toHaveBeenLastCalledWith([
    { type: 'structured', payload: { values: { count: 3, sealed: true } } },
  ])
})

// ── structuredFormValues (the raw-state → values mapping) ────────────

const FIELDS = PARAMS.structured?.fields ?? []

test('structuredFormValues parses numbers, keeps strings, and skips blanks', () => {
  expect(structuredFormValues(FIELDS, { count: ' 4 ', note: ' left rear ' }, { sealed: false })).toEqual({
    count: 4,
    note: 'left rear',
    sealed: false,
  })
  expect(structuredFormValues(FIELDS, { count: '', note: '' }, {})).toEqual({})
})

test('an unparseable number passes through AS TEXT so the conformance check names the real problem', () => {
  // 'abc' in a number field → kind mismatch ("must be a number"), never
  // "count is required" — the worker typed something.
  expect(structuredFormValues(FIELDS, { count: 'abc' }, {})).toEqual({ count: 'abc' })
  expect(structuredFormValues(FIELDS, { count: 'Infinity' }, {})).toEqual({ count: 'Infinity' })
})

test('a field named "__proto__" keeps its answer as DATA — assignment would drop it', () => {
  const proto = [{ name: '__proto__', kind: 'number' as const, required: true }]
  const values = structuredFormValues(proto, Object.fromEntries([['__proto__', '3']]), {})
  assert(Object.hasOwn(values, '__proto__'))
  expect(values).toEqual(Object.fromEntries([['__proto__', 3]]))
})
