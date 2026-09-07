/**
 * The proof-param editors — the composer UI behind a geotag or structured
 * requirement. What matters downstream: the geotag editor writes the
 * captured pin and typed radius into the DRAFT (shared proofSetupProblem
 * judges them), and the fields editor edits rows without ever inventing or
 * losing one.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import {
  DEFAULT_GEOTAG_RADIUS_M,
  MAX_STRUCTURED_FIELDS,
  STRUCTURED_FIELD_KIND_LABEL,
  emptyProofParamsDraft,
  type StructuredFieldDraft,
} from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        border: { default: '#ddd', subtle: '#eee' },
        surface: { card: '#fff', inset: '#f4f4f4' },
        brand: { primary: '#25f', onPrimary: '#fff' },
        feedback: { danger: { base: '#c00', surface: '#fcc' } },
      },
    },
  }),
}))

const mockCapture = jest.fn()
let mockError: string | null = null
jest.mock('@/hooks/useDeviceCoords', () => ({
  useDeviceCoords: () => ({ capture: mockCapture, capturing: false, error: mockError }),
}))

import { GeotagParamsEditor } from '../proof-params/GeotagParamsEditor'
import { StructuredFieldsEditor } from '../proof-params/StructuredFieldsEditor'

beforeEach(() => {
  jest.clearAllMocks()
  mockError = null
})

// ── GeotagParamsEditor ───────────────────────────────────────────────

test('capturing writes the pin into the draft; the button then offers recapture', async () => {
  mockCapture.mockResolvedValue({ latitude: 6.52443891, longitude: 3.37921234 })
  const onChange = jest.fn()
  const draft = emptyProofParamsDraft()
  const view = render(<GeotagParamsEditor draft={draft} onChange={onChange} />)

  fireEvent.press(screen.getByText('Use my current location'))
  await screen.findByText('Use my current location') // flush the async press
  expect(onChange).toHaveBeenCalledWith({
    ...draft,
    pin: { latitude: 6.52443891, longitude: 3.37921234 },
  })

  // Feed the new draft back, as the form would.
  view.rerender(
    <GeotagParamsEditor
      draft={{ ...draft, pin: { latitude: 6.52443891, longitude: 3.37921234 } }}
      onChange={onChange}
    />,
  )
  expect(screen.getByText(/Pinned at 6\.52444, 3\.37921/)).toBeTruthy()
  expect(screen.getByText('Recapture location')).toBeTruthy()
})

test('a failed capture changes nothing in the draft', async () => {
  mockCapture.mockResolvedValue(null)
  const onChange = jest.fn()
  render(<GeotagParamsEditor draft={emptyProofParamsDraft()} onChange={onChange} />)

  fireEvent.press(screen.getByText('Use my current location'))
  await screen.findByText('Use my current location')
  expect(onChange).not.toHaveBeenCalled()
})

test('the capture error is shown to the poster', () => {
  mockError = 'Location permission denied — allow it in Settings to use this.'
  render(<GeotagParamsEditor draft={emptyProofParamsDraft()} onChange={jest.fn()} />)
  expect(screen.getByText(/permission denied/i)).toBeTruthy()
})

test('the radius field edits radiusText verbatim, seeded with the shared default', () => {
  const onChange = jest.fn()
  const draft = emptyProofParamsDraft()
  render(<GeotagParamsEditor draft={draft} onChange={onChange} />)

  const input = screen.getByDisplayValue(String(DEFAULT_GEOTAG_RADIUS_M))
  fireEvent.changeText(input, '120')
  // Verbatim — parsing and refusing is the shared validator's job.
  expect(onChange).toHaveBeenCalledWith({ ...draft, radiusText: '120' })
})

// ── StructuredFieldsEditor ───────────────────────────────────────────

const FIELD: StructuredFieldDraft = { name: 'count', kind: 'number', required: true }

test('Add field appends a fresh required text row', () => {
  const onChange = jest.fn()
  render(<StructuredFieldsEditor fields={[FIELD]} onChange={onChange} />)
  fireEvent.press(screen.getByText('Add field'))
  expect(onChange).toHaveBeenCalledWith([FIELD, { name: '', kind: 'string', required: true }])
})

test('editing a row patches THAT row and no other', () => {
  const onChange = jest.fn()
  const other: StructuredFieldDraft = { name: 'note', kind: 'string', required: false }
  render(<StructuredFieldsEditor fields={[FIELD, other]} onChange={onChange} />)

  fireEvent.changeText(screen.getByDisplayValue('note'), 'notes')
  expect(onChange).toHaveBeenCalledWith([FIELD, { ...other, name: 'notes' }])

  // Kind chips and the required toggle patch in place too.
  fireEvent.press(screen.getAllByText(STRUCTURED_FIELD_KIND_LABEL.boolean)[0] as never)
  expect(onChange).toHaveBeenLastCalledWith([{ ...FIELD, kind: 'boolean' }, other])
  fireEvent.press(screen.getAllByText('Required')[0] as never)
  expect(onChange).toHaveBeenLastCalledWith([{ ...FIELD, required: false }, other])
})

test('removing a row keeps the rest', () => {
  const onChange = jest.fn()
  const other: StructuredFieldDraft = { name: 'note', kind: 'string', required: false }
  render(<StructuredFieldsEditor fields={[FIELD, other]} onChange={onChange} />)
  fireEvent.press(screen.getByLabelText('Remove field 1'))
  expect(onChange).toHaveBeenCalledWith([other])
})

test('Add field is disabled at the shared cap', () => {
  const many = Array.from({ length: MAX_STRUCTURED_FIELDS }, (_, i) => ({
    ...FIELD,
    name: `f${i}`,
  }))
  const onChange = jest.fn()
  render(<StructuredFieldsEditor fields={many} onChange={onChange} />)
  fireEvent.press(screen.getByText('Add field'))
  expect(onChange).not.toHaveBeenCalled()
})
