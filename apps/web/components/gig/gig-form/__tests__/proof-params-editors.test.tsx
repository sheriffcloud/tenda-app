/**
 * The proof-param editors (web twins) — the composer UI behind a geotag or
 * structured requirement. The geotag editor writes the captured pin and the
 * typed radius into the DRAFT (shared proofSetupProblem judges them); the
 * fields editor edits rows without inventing or losing one.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  DEFAULT_GEOTAG_RADIUS_M,
  MAX_STRUCTURED_FIELDS,
  STRUCTURED_FIELD_KIND_LABEL,
  emptyProofParamsDraft,
  type StructuredFieldDraft,
} from '@tenda/shared'

const { mockCapture, state } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  state: { error: null as string | null },
}))
vi.mock('@/hooks/useDeviceCoords', () => ({
  useDeviceCoords: () => ({ capture: mockCapture, capturing: false, error: state.error }),
}))

import { GeotagParamsEditor } from '@/components/gig/gig-form/proof-params/GeotagParamsEditor'
import { StructuredFieldsEditor } from '@/components/gig/gig-form/proof-params/StructuredFieldsEditor'

beforeEach(() => {
  vi.clearAllMocks()
  state.error = null
})

test('capturing writes the pin into the draft; the button then offers recapture', async () => {
  mockCapture.mockResolvedValue({ latitude: 6.52443891, longitude: 3.37921234 })
  const onChange = vi.fn()
  const draft = emptyProofParamsDraft()
  const { rerender } = render(<GeotagParamsEditor draft={draft} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }))
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      pin: { latitude: 6.52443891, longitude: 3.37921234 },
    }),
  )
  rerender(
    <GeotagParamsEditor
      draft={{ ...draft, pin: { latitude: 6.52443891, longitude: 3.37921234 } }}
      onChange={onChange}
    />,
  )
  expect(screen.getByText(/Pinned at 6\.52444, 3\.37921/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recapture location' })).toBeInTheDocument()
})

test('a failed capture changes nothing; the hook error is shown', async () => {
  mockCapture.mockResolvedValue(null)
  state.error = 'Location permission denied — allow it in your browser to use this.'
  const onChange = vi.fn()
  render(<GeotagParamsEditor draft={emptyProofParamsDraft()} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }))
  await waitFor(() => expect(mockCapture).toHaveBeenCalled())
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
})

test('the radius field edits radiusText verbatim, seeded with the shared default', () => {
  const onChange = vi.fn()
  const draft = emptyProofParamsDraft()
  render(<GeotagParamsEditor draft={draft} onChange={onChange} />)
  const input = screen.getByDisplayValue(String(DEFAULT_GEOTAG_RADIUS_M))
  fireEvent.change(input, { target: { value: '120' } })
  // Verbatim — parsing and refusing is the shared validator's job.
  expect(onChange).toHaveBeenCalledWith({ ...draft, radiusText: '120' })
})

const FIELD: StructuredFieldDraft = { name: 'count', kind: 'number', required: true }

test('Add field appends a fresh required text row', () => {
  const onChange = vi.fn()
  render(<StructuredFieldsEditor fields={[FIELD]} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
  expect(onChange).toHaveBeenCalledWith([FIELD, { name: '', kind: 'string', required: true }])
})

test('editing a row patches THAT row and no other', () => {
  const onChange = vi.fn()
  const other: StructuredFieldDraft = { name: 'note', kind: 'string', required: false }
  render(<StructuredFieldsEditor fields={[FIELD, other]} onChange={onChange} />)

  fireEvent.change(screen.getByDisplayValue('note'), { target: { value: 'notes' } })
  expect(onChange).toHaveBeenCalledWith([FIELD, { ...other, name: 'notes' }])

  fireEvent.click(screen.getAllByRole('button', { name: STRUCTURED_FIELD_KIND_LABEL.boolean })[0]!)
  expect(onChange).toHaveBeenLastCalledWith([{ ...FIELD, kind: 'boolean' }, other])
  fireEvent.click(screen.getByRole('button', { name: 'Required' }))
  expect(onChange).toHaveBeenLastCalledWith([{ ...FIELD, required: false }, other])
})

test('removing a row keeps the rest', () => {
  const onChange = vi.fn()
  const other: StructuredFieldDraft = { name: 'note', kind: 'string', required: false }
  render(<StructuredFieldsEditor fields={[FIELD, other]} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove field 1' }))
  expect(onChange).toHaveBeenCalledWith([other])
})

test('Add field is disabled at the shared cap', () => {
  const many = Array.from({ length: MAX_STRUCTURED_FIELDS }, (_, i) => ({ ...FIELD, name: `f${i}` }))
  render(<StructuredFieldsEditor fields={many} onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Add field' })).toBeDisabled()
})
