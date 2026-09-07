/**
 * ChipGroup — the layout shared by single-select (DurationChips) and
 * multi-select (ProofRequirementPicker) pickers. DurationChips' suite already
 * renders the single-select path; this pins the multi-select contract that
 * motivated the extraction, which would otherwise only ever be exercised
 * against a mock.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { content: { primary: '#000', secondary: '#333', tertiary: '#666' } } },
  }),
}))
jest.mock('../Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('../SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('../Chip', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Chip: ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
        <Text>{`${label}${selected ? ' [on]' : ''}`}</Text>
      </Pressable>
    ),
  }
})

import { ChipGroup } from '../ChipGroup'

const OPTIONS = [
  { label: 'Photo', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Document', value: 'document' },
] as const

function setup(selected: string[]) {
  const onPress = jest.fn()
  render(
    <ChipGroup
      label="Required proof"
      hint="Pick any"
      options={[...OPTIONS]}
      isSelected={(v) => selected.includes(v)}
      onPress={onPress}
    />,
  )
  return { onPress }
}

test('renders the label, hint and every option', () => {
  setup([])
  expect(screen.getByText('Required proof')).toBeTruthy()
  expect(screen.getByText('Pick any')).toBeTruthy()
  for (const o of OPTIONS) expect(screen.getByText(o.label)).toBeTruthy()
})

test('several chips can be selected at once', () => {
  setup(['image', 'document'])
  expect(screen.getByText('Photo [on]')).toBeTruthy()
  expect(screen.getByText('Document [on]')).toBeTruthy()
  expect(screen.getByText('Video')).toBeTruthy()
})

test('none selected renders every chip unselected', () => {
  setup([])
  for (const o of OPTIONS) expect(screen.getByText(o.label)).toBeTruthy()
})

test('pressing a chip reports its value', () => {
  const { onPress } = setup([])
  fireEvent.press(screen.getByText('Video'))
  expect(onPress).toHaveBeenCalledWith('video')
})

test('pressing an already-selected chip still reports it (caller owns toggling)', () => {
  const { onPress } = setup(['video'])
  fireEvent.press(screen.getByText('Video [on]'))
  expect(onPress).toHaveBeenCalledWith('video')
})

test('the hint is omitted when not supplied', () => {
  render(
    <ChipGroup label="Required proof" options={[...OPTIONS]} isSelected={() => false} onPress={jest.fn()} />,
  )
  expect(screen.queryByText('Pick any')).toBeNull()
})
