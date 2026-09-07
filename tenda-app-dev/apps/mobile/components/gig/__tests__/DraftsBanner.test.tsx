/**
 * DraftsBanner — the entry point that replaced the Drafts tab.
 *
 * The load-bearing behaviour is the zero case: it must render NOTHING rather
 * than an empty-state row, because the whole reason drafts stopped being a tab
 * is that most users have none and were carrying a permanently empty one.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        border: { subtle: '#eee' },
        brand: { primary: '#50f', primarySurface: '#eef' },
        content: { primary: '#000', secondary: '#666', tertiary: '#888' },
        surface: { inset: '#f5f5f5' },
      },
    },
  }),
}))

jest.mock('lucide-react-native', () => ({
  FileClock: () => null,
  ChevronRight: () => null,
}))

import { DraftsBanner } from '../DraftsBanner'

test('renders nothing at zero — an empty row is what the tab already was', () => {
  render(<DraftsBanner count={0} onPress={jest.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('renders nothing for a negative count', () => {
  render(<DraftsBanner count={-1} onPress={jest.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('singular copy at one draft', () => {
  render(<DraftsBanner count={1} onPress={jest.fn()} />)
  expect(screen.getByText('1 draft')).toBeTruthy()
})

test('plural copy above one', () => {
  render(<DraftsBanner count={4} onPress={jest.fn()} />)
  expect(screen.getByText('4 drafts')).toBeTruthy()
})

test('says drafts are private — the reason they are not "posted"', () => {
  render(<DraftsBanner count={2} onPress={jest.fn()} />)
  expect(screen.getByText(/nobody else can see these/i)).toBeTruthy()
})

test('opens the drafts screen when pressed', () => {
  const onPress = jest.fn()
  render(<DraftsBanner count={2} onPress={onPress} />)
  fireEvent.press(screen.getByRole('button'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('carries the count in its accessibility label', () => {
  render(<DraftsBanner count={3} onPress={jest.fn()} />)
  // The visible copy is split across two lines; a screen reader gets one.
  expect(screen.getByLabelText('3 drafts, not yet posted. Open drafts.')).toBeTruthy()
})
