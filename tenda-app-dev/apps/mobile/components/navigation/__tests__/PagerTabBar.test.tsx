/**
 * PagerTabBar — the shared underline tab row. Counts are the interesting part:
 * an absent count must render no chip at all (so a tab with no meaningful
 * total isn't decorated), and a zero count must still render (a real "you have
 * none" is information, not an absence).
 *
 * The underline's travel is pinned for THREE tabs as well as two: it is driven
 * by an interpolation of the pager's scroll offset, and a range written for a
 * single page width is invisibly correct at two tabs and wrong at three.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Animated, StyleSheet } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        border: { subtle: '#eee' },
        brand: { primary: '#50f', primarySurface: '#eef' },
        content: { primary: '#000', tertiary: '#888' },
        surface: { inset: '#f5f5f5' },
      },
    },
  }),
}))

import { PagerTabBar } from '../PagerTabBar'

const scrollX = new Animated.Value(0)

function renderBar(tabs: { key: string; label: string; count?: number }[], onTabPress = jest.fn()) {
  render(
    <PagerTabBar
      tabs={tabs}
      activeIndex={0}
      scrollX={scrollX}
      pageWidth={375}
      onTabPress={onTabPress}
    />,
  )
  return onTabPress
}

test('renders a label per tab', () => {
  renderBar([{ key: 'a', label: 'Posted' }, { key: 'b', label: 'Working' }])
  expect(screen.getByText('Posted')).toBeTruthy()
  expect(screen.getByText('Working')).toBeTruthy()
})

test('renders the count chip when a count is supplied', () => {
  renderBar([{ key: 'a', label: 'Posted', count: 12 }, { key: 'b', label: 'Working', count: 3 }])
  expect(screen.getByText('12')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
})

test('renders a zero count — "none" is a real answer, not a missing one', () => {
  renderBar([{ key: 'a', label: 'Working', count: 0 }])
  expect(screen.getByText('0')).toBeTruthy()
})

test('renders no chip when the tab has no count', () => {
  renderBar([{ key: 'a', label: 'Market' }])
  expect(screen.queryByText('0')).toBeNull()
})

test('reports the pressed tab index', () => {
  const onTabPress = renderBar([
    { key: 'a', label: 'Posted' },
    { key: 'b', label: 'Working' },
  ])
  fireEvent.press(screen.getByText('Working'))
  expect(onTabPress).toHaveBeenCalledWith(1)
})

test('marks the active tab for accessibility', () => {
  renderBar([{ key: 'a', label: 'Posted' }, { key: 'b', label: 'Working' }])
  const tabs = screen.getAllByRole('tab')
  expect(tabs[0].props.accessibilityState.selected).toBe(true)
  expect(tabs[1].props.accessibilityState.selected).toBe(false)
})

const PAGE = 375

/** Underline position for `tabCount` tabs with the pager scrolled to `offset`. */
function underlineAt(tabCount: number, offset: number) {
  const scroll = new Animated.Value(offset)
  const { unmount, getByTestId } = render(
    <PagerTabBar
      tabs={Array.from({ length: tabCount }, (_, i) => ({ key: `t${i}`, label: `Tab ${i}` }))}
      activeIndex={0}
      scrollX={scroll}
      pageWidth={PAGE}
      onTabPress={jest.fn()}
    />,
  )
  const style = StyleSheet.flatten(getByTestId('pager-underline').props.style)
  const x = style.transform[0].translateX
  const width = style.width
  unmount()
  return { x: typeof x === 'number' ? x : x.__getValue(), width }
}

test('the underline sits under the last tab when the pager is on the last page', () => {
  // The regression: the interpolation mapped only [0, pageWidth] and clamped,
  // so with three tabs the underline froze under tab 2 and Drafts never got
  // an underline at all.
  const { x, width } = underlineAt(3, PAGE * 2)
  expect(width).toBeCloseTo(PAGE / 3)
  expect(x).toBeCloseTo((PAGE / 3) * 2)
})

test('the underline tracks a partial swipe between the last two tabs', () => {
  const { x } = underlineAt(3, PAGE * 1.5)
  expect(x).toBeCloseTo((PAGE / 3) * 1.5)
})

test('two tabs are unchanged — full travel on one page of scroll', () => {
  expect(underlineAt(2, 0).x).toBeCloseTo(0)
  expect(underlineAt(2, PAGE).x).toBeCloseTo(PAGE / 2)
})

test('a single tab produces a valid, stationary underline', () => {
  // `lastPage` is floored at 1: a zero-width input range is an invalid
  // interpolation, which throws rather than merely rendering wrong.
  const { x, width } = underlineAt(1, 0)
  expect(x).toBe(0)
  expect(width).toBeCloseTo(PAGE)
})
