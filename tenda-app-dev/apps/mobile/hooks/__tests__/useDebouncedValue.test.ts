/**
 * useDebouncedValue — collapses a burst of changes into one settled value.
 * Without it every keystroke in the feed search box is a network request.
 */
import { renderHook, act } from '@testing-library/react-native'
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from '@/hooks/useDebouncedValue'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('returns the initial value immediately', () => {
  const { result } = renderHook(() => useDebouncedValue('start'))
  expect(result.current).toBe('start')
})

test('holds the previous value until the delay elapses', () => {
  const { result, rerender } = renderHook(({ v }: { v: string }) => useDebouncedValue(v), {
    initialProps: { v: 'a' },
  })
  rerender({ v: 'b' })
  expect(result.current).toBe('a')

  act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
  expect(result.current).toBe('b')
})

test('a burst settles once, on the LAST value', () => {
  const { result, rerender } = renderHook(({ v }: { v: string }) => useDebouncedValue(v), {
    initialProps: { v: '' },
  })
  rerender({ v: 'p' })
  act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50) })
  rerender({ v: 'pa' })
  act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50) })
  rerender({ v: 'paint' })
  // Each change restarted the timer — nothing has settled yet.
  expect(result.current).toBe('')

  act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
  expect(result.current).toBe('paint')
})

test('honours a custom delay', () => {
  const { result, rerender } = renderHook(
    ({ v }: { v: number }) => useDebouncedValue(v, 1000),
    { initialProps: { v: 1 } },
  )
  rerender({ v: 2 })
  act(() => { jest.advanceTimersByTime(999) })
  expect(result.current).toBe(1)
  act(() => { jest.advanceTimersByTime(1) })
  expect(result.current).toBe(2)
})

test('a value that returns to its original still settles there', () => {
  const { result, rerender } = renderHook(({ v }: { v: string }) => useDebouncedValue(v), {
    initialProps: { v: 'a' },
  })
  rerender({ v: 'b' })
  rerender({ v: 'a' })
  act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
  expect(result.current).toBe('a')
})
