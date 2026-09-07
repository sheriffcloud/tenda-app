/**
 * ProofRequirementPicker — the multi-select wrapper over the shared ChipGroup.
 * The invariant that matters downstream is normalisation: whatever order the
 * poster taps in, the value handed to the form (and then the server) is in
 * PROOF_TYPES order and deduplicated, so two equivalent selections are
 * indistinguishable.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { FILE_PROOF_TYPES, PROOF_TYPES, PROOF_TYPE_LABEL, type ProofType } from '@tenda/shared'

interface Captured {
  label: string
  hint?: string
  options: { label: string; value: ProofType; disabled?: boolean }[]
  isSelected: (value: ProofType) => boolean
  onPress: (value: ProofType) => void
}
let captured: Captured | null = null

jest.mock('@/components/ui/ChipGroup', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ChipGroup: (props: Captured) => {
      captured = props
      return (
        <>
          <Text>{props.label}</Text>
          {props.options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: props.isSelected(o.value) }}
              onPress={() => props.onPress(o.value)}
            >
              <Text>{o.label}</Text>
            </Pressable>
          ))}
        </>
      )
    },
  }
})

import { ProofRequirementPicker } from '../ProofRequirementPicker'

beforeEach(() => {
  captured = null
})

function setup(value: ProofType[] = [], remote = false) {
  const onChange = jest.fn()
  const view = render(<ProofRequirementPicker value={value} onChange={onChange} remote={remote} />)
  return { onChange, view }
}

test('offers the FULL vocabulary, data types included, all enabled', () => {
  // #15 gave the data types their params + capture UI, so requiring one no
  // longer strands the worker — every type is on offer.
  setup()
  for (const type of PROOF_TYPES) {
    expect(screen.getByText(PROOF_TYPE_LABEL[type])).toBeTruthy()
  }
  expect(captured?.options.every((option) => option.disabled === false)).toBe(true)
})

test('a REMOTE gig disables geotag — unless already selected, so it can still be unpicked', () => {
  // A remote gig has nowhere to check in; the server refuses the pair. But a
  // disabled chip cannot be DESELECTED either, so an already-selected geotag
  // stays pressable as the way out of the refused combination.
  setup([], true)
  const disabledTypes = captured?.options.filter((o) => o.disabled).map((o) => o.value)
  expect(disabledTypes).toEqual(['geotag'])

  const { onChange } = setup(['geotag'], true)
  expect(captured?.options.find((o) => o.value === 'geotag')?.disabled).toBe(false)
  captured?.onPress('geotag')
  expect(onChange).toHaveBeenCalledWith([])
})

test('carries the label and the optional-requirement hint', () => {
  setup()
  expect(captured?.label).toBe('Required proof')
  expect(captured?.hint).toMatch(/optional/i)
})

test('selecting an unselected type adds it', () => {
  const { onChange } = setup([])
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.video))
  expect(onChange).toHaveBeenCalledWith(['video'])
})

test('selection is normalised into PROOF_TYPES order, not tap order', () => {
  const { onChange } = setup(['video'])
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.image))
  expect(onChange).toHaveBeenCalledWith(['image', 'video'])
})

test('pressing a selected type removes it', () => {
  const { onChange } = setup(['image', 'video'])
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.image))
  expect(onChange).toHaveBeenCalledWith(['video'])
})

test('deselecting the last type yields an empty requirement list', () => {
  const { onChange } = setup(['document'])
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.document))
  expect(onChange).toHaveBeenCalledWith([])
})

test('reports current selection back to the chips', () => {
  setup(['document'])
  expect(captured?.isSelected('document')).toBe(true)
  expect(captured?.isSelected('image')).toBe(false)
})

test('a repeated press toggles off rather than duplicating', () => {
  const { onChange, view } = setup([])
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.image))
  expect(onChange).toHaveBeenCalledWith(['image'])

  // Feed the emitted value back in, as the form's state would, and press again.
  view.rerender(<ProofRequirementPicker value={['image']} onChange={onChange} />)
  fireEvent.press(screen.getByText(PROOF_TYPE_LABEL.image))
  expect(onChange).toHaveBeenLastCalledWith([])
})
