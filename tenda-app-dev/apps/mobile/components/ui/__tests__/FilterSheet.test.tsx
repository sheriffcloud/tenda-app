import { fireEvent, render, screen } from '@testing-library/react-native'
import { CATEGORY_LABELS } from '@tenda/shared'
import { colors } from '@/theme/tokens'
import { FilterSheet } from '../FilterSheet'

const mockColors = colors.dark

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: mockColors } }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('lucide-react-native', () => ({ Search: () => null, X: () => null }))
jest.mock('@/components/form/LocationPicker', () => ({ LocationPicker: () => null }))
jest.mock('@/components/ui/Chip', () => {
  // Jest mock factories cannot close over the module's top-level React Native import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native')
  return {
    Chip: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable onPress={onPress}><Text>{label}</Text></Pressable>
    ),
  }
})

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  query: '',
  onQueryChange: jest.fn(),
  selectedCategory: null,
  onCategoryChange: jest.fn(),
  country: null,
  city: null,
  onLocationChange: jest.fn(),
  remote: null,
  onRemoteChange: jest.fn(),
  crossBorder: null,
  onCrossBorderChange: jest.fn(),
  onClearAll: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

it('keeps gig-type filters mutually exclusive', () => {
  render(<FilterSheet {...baseProps} />)

  fireEvent.press(screen.getByText('Remote'))
  expect(baseProps.onRemoteChange).toHaveBeenCalledWith(true)
  expect(baseProps.onCrossBorderChange).toHaveBeenCalledWith(null)

  fireEvent.press(screen.getByText('Cross-border'))
  expect(baseProps.onCrossBorderChange).toHaveBeenLastCalledWith(true)
  expect(baseProps.onRemoteChange).toHaveBeenLastCalledWith(null)
})

it('only offers clear when a filter is active and wires it correctly', () => {
  const { rerender } = render(<FilterSheet {...baseProps} />)
  expect(screen.queryByText('Clear all filters')).toBeNull()

  rerender(<FilterSheet {...baseProps} query="delivery" />)
  fireEvent.press(screen.getByText('Clear all filters'))
  expect(baseProps.onClearAll).toHaveBeenCalledTimes(1)
})

it('toggles the selected category off and selects a different category', () => {
  const { rerender } = render(<FilterSheet {...baseProps} selectedCategory="delivery" />)
  fireEvent.press(screen.getByText('Delivery'))
  expect(baseProps.onCategoryChange).toHaveBeenCalledWith(null)

  rerender(<FilterSheet {...baseProps} selectedCategory={null} />)
  fireEvent.press(screen.getByText(CATEGORY_LABELS.photo))
  expect(baseProps.onCategoryChange).toHaveBeenLastCalledWith('photo')
})

it.each([
  { country: 'NG' },
  { city: 'Lagos' },
  { remote: false },
  { crossBorder: true },
])('offers clear for each non-query filter state: %o', (activeFilter) => {
  render(<FilterSheet {...baseProps} {...activeFilter} />)
  expect(screen.getByText('Clear all filters')).toBeTruthy()
})

it('closes through the shared backdrop', () => {
  render(<FilterSheet {...baseProps} />)
  fireEvent.press(screen.getByTestId('modal-backdrop', { includeHiddenElements: true }))
  expect(baseProps.onClose).toHaveBeenCalledTimes(1)
})
