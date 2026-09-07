import { fireEvent, render, screen } from '@testing-library/react-native'
import { colors } from '@/theme/tokens'
import { SearchSheet } from '../SearchSheet'

const mockColors = colors.dark

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: mockColors } }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('lucide-react-native', () => ({ Search: () => null, Check: () => null, X: () => null }))

const items = [
  { key: 'lagos', label: 'Lagos', sublabel: 'Nigeria' },
  { key: 'accra', label: 'Accra' },
]

it('filters case-insensitively and closes with the selected key', () => {
  const onSelect = jest.fn()
  const onClose = jest.fn()
  render(
    <SearchSheet
      visible
      title="Choose city"
      items={items}
      value={null}
      onSelect={onSelect}
      onClose={onClose}
    />,
  )

  fireEvent.changeText(screen.getByPlaceholderText('Search…'), 'LAG')
  expect(screen.queryByText('Accra')).toBeNull()
  fireEvent.press(screen.getByText('Lagos'))
  expect(onSelect).toHaveBeenCalledWith('lagos')
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('shows an empty result and clears the query when dismissed', () => {
  const onClose = jest.fn()
  render(
    <SearchSheet
      visible
      title="Choose city"
      items={items}
      value="lagos"
      onSelect={jest.fn()}
      onClose={onClose}
    />,
  )

  const searchInput = screen.getByPlaceholderText('Search…')
  fireEvent.changeText(searchInput, 'missing')
  expect(screen.getByText('No results for "missing"')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Close sheet'))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(searchInput.props.value).toBe('')
})
