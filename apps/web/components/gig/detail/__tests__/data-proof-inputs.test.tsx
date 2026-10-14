/**
 * DataProofInputs + StructuredProofForm (web twins) — the worker's capture
 * UI for the required data types. The contract the dialog relies on: an
 * entry is only reported for a type whose capture is COMPLETE and
 * conformant, so the checklist (and the submit gate) stays honest.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ProofParams } from '@tenda/shared'

const { mockCapture, state } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  state: { error: null as string | null },
}))
vi.mock('@/hooks/useDeviceCoords', () => ({
  useDeviceCoords: () => ({ capture: mockCapture, capturing: false, error: state.error }),
}))

import { DataProofInputs } from '@/components/gig/detail/data-proofs/DataProofInputs'
import { structuredFormValues } from '@/components/gig/detail/data-proofs/StructuredProofForm'

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
  vi.clearAllMocks()
  state.error = null
})

test('renders nothing when no data type is required', () => {
  const { container } = render(
    <DataProofInputs requirements={['image']} proofParams={null} gigPin={null} onChange={vi.fn()} />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('a check-in inside the radius reports the geotag entry and says it is in range', async () => {
  mockCapture.mockResolvedValue({ latitude: 6.5244, longitude: 3.3806 }) // ~157 m east
  const onChange = vi.fn()
  render(<DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check in at my location' }))
  await screen.findByText(/Checked in at/)
  expect(onChange).toHaveBeenCalledWith([{ type: 'geotag', payload: { latitude: 6.5244, longitude: 3.3806 } }])
  expect(screen.getByText(/within range/)).toBeInTheDocument()
})

test('an OUT-OF-RANGE check-in still reports the entry but warns it will be refused', async () => {
  // ~11 km away. Advisory only — the server is the judge, and swallowing the
  // entry would leave a dead submit button with no explanation.
  mockCapture.mockResolvedValue({ latitude: 6.4244, longitude: 3.3792 })
  const onChange = vi.fn()
  render(<DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check in at my location' }))
  await screen.findByText(/It will be refused from here/)
  expect(onChange).toHaveBeenCalledWith([{ type: 'geotag', payload: { latitude: 6.4244, longitude: 3.3792 } }])
})

test('a failed capture reports nothing and surfaces the hook error', async () => {
  mockCapture.mockResolvedValue(null)
  state.error = 'Could not read your location. Try again.'
  const onChange = vi.fn()
  render(<DataProofInputs requirements={['geotag']} proofParams={PARAMS} gigPin={PIN} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check in at my location' }))
  await waitFor(() => expect(mockCapture).toHaveBeenCalled())
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByText(/Could not read/)).toBeInTheDocument()
})

test('the written answer reports trimmed text — and retracts when emptied', () => {
  const onChange = vi.fn()
  render(<DataProofInputs requirements={['text']} proofParams={null} gigPin={null} onChange={onChange} />)
  const input = screen.getByPlaceholderText(/Describe what you did/)
  fireEvent.change(input, { target: { value: '  delivered to the gate  ' } })
  expect(onChange).toHaveBeenLastCalledWith([{ type: 'text', payload: { text: 'delivered to the gate' } }])
  fireEvent.change(input, { target: { value: '   ' } })
  expect(onChange).toHaveBeenLastCalledWith([])
})

test('the structured form reports only once the value set CONFORMS', () => {
  const onChange = vi.fn()
  render(<DataProofInputs requirements={['structured']} proofParams={PARAMS} gigPin={null} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('count'), { target: { value: '3' } })
  // Boolean still unanswered → nothing reports; the problem is named inline.
  expect(onChange).toHaveBeenLastCalledWith([])
  expect(screen.getByText(/"sealed" is required/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
  expect(onChange).toHaveBeenLastCalledWith([
    { type: 'structured', payload: { values: { count: 3, sealed: true } } },
  ])
})

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
  expect(structuredFormValues(FIELDS, { count: 'abc' }, {})).toEqual({ count: 'abc' })
  expect(structuredFormValues(FIELDS, { count: 'Infinity' }, {})).toEqual({ count: 'Infinity' })
})

test('a field named "__proto__" keeps its answer as DATA — assignment would drop it', () => {
  const proto = [{ name: '__proto__', kind: 'number' as const, required: true }]
  const values = structuredFormValues(proto, Object.fromEntries([['__proto__', '3']]), {})
  expect(Object.hasOwn(values, '__proto__')).toBe(true)
  expect(values).toEqual(Object.fromEntries([['__proto__', 3]]))
})
