/**
 * useCountdown — ticks the remaining-ms once per second and stops itself the
 * moment the deadline passes, so an expired offer left on screen doesn't tick
 * (or re-render) forever.
 */
import { renderHook, act } from '@testing-library/react-native'
import { useCountdown } from '@/hooks/useCountdown'

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

test('null deadline → null (no ticking)', () => {
  const { result } = renderHook(() => useCountdown(null))
  expect(result.current).toBeNull()
})

test('counts down roughly one second per tick', () => {
  jest.setSystemTime(new Date('2026-07-10T00:00:00Z'))
  const deadline = new Date('2026-07-10T00:00:10Z') // 10s out
  const { result } = renderHook(() => useCountdown(deadline))
  expect(result.current).toBe(10_000)
  act(() => { jest.advanceTimersByTime(1_000) })
  expect(result.current).toBe(9_000)
  act(() => { jest.advanceTimersByTime(3_000) })
  expect(result.current).toBe(6_000)
})

test('clamps at zero and stops the interval once expired', () => {
  jest.setSystemTime(new Date('2026-07-10T00:00:00Z'))
  const deadline = new Date('2026-07-10T00:00:02Z') // 2s out
  const { result } = renderHook(() => useCountdown(deadline))
  act(() => { jest.advanceTimersByTime(5_000) })
  expect(result.current).toBe(0)
  // No timers should remain scheduled — the interval cleared itself.
  expect(jest.getTimerCount()).toBe(0)
})

test('an already-past deadline returns 0 and schedules nothing', () => {
  jest.setSystemTime(new Date('2026-07-10T00:00:00Z'))
  const deadline = new Date('2026-07-09T00:00:00Z') // yesterday
  const { result } = renderHook(() => useCountdown(deadline))
  expect(result.current).toBe(0)
  expect(jest.getTimerCount()).toBe(0)
})

test('re-syncs when the deadline prop changes', () => {
  jest.setSystemTime(new Date('2026-07-10T00:00:00Z'))
  const { result, rerender } = renderHook<number | null, { d: Date }>(
    ({ d }) => useCountdown(d),
    { initialProps: { d: new Date('2026-07-10T00:00:05Z') } },
  )
  expect(result.current).toBe(5_000)
  rerender({ d: new Date('2026-07-10T00:00:20Z') })
  expect(result.current).toBe(20_000)
})

test('unmount clears the interval', () => {
  jest.setSystemTime(new Date('2026-07-10T00:00:00Z'))
  const { unmount } = renderHook(() => useCountdown(new Date('2026-07-10T01:00:00Z')))
  expect(jest.getTimerCount()).toBe(1)
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})
