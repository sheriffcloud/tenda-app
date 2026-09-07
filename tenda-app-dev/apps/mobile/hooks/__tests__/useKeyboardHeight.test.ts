/**
 * useKeyboardHeight — derives the on-screen keyboard height from the keyboard's
 * TOP (screenHeight − screenY, robust to edge-to-edge under-reporting of
 * endCoordinates.height) while shown, forces 0 when hidden (so bottom-anchored
 * bars have no spurious gap at rest), and detaches all listeners on unmount.
 */
import { renderHook, act } from '@testing-library/react-native'
import { Dimensions, Keyboard, type EmitterSubscription, type KeyboardEvent } from 'react-native'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'

const SCREEN_HEIGHT = 800

function captureListeners() {
  const handlers: Record<string, (e: KeyboardEvent) => void> = {}
  const remove = jest.fn()
  const sub = { remove } as unknown as EmitterSubscription
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
    handlers[String(event)] = cb as (e: KeyboardEvent) => void
    return sub
  })
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ height: SCREEN_HEIGHT, width: 400, scale: 2, fontScale: 1 })
  return { handlers, remove }
}

/** Keyboard whose TOP sits `height` px above the bottom of an 800px screen. */
function showEvent(height: number): KeyboardEvent {
  return {
    endCoordinates: { height: -1, screenX: 0, screenY: SCREEN_HEIGHT - height, width: 400 },
  } as KeyboardEvent
}

afterEach(() => jest.restoreAllMocks())

test('starts at 0, reports keyboard height on show, resets to 0 on hide', () => {
  const { handlers } = captureListeners()
  const { result } = renderHook(() => useKeyboardHeight())

  expect(result.current).toBe(0)
  act(() => handlers.keyboardDidShow(showEvent(320)))
  expect(result.current).toBe(320)
  act(() => handlers.keyboardDidHide(showEvent(0)))
  expect(result.current).toBe(0)
})

test('derives from screenY, ignoring the under-reported endCoordinates.height', () => {
  const { handlers } = captureListeners()
  const { result } = renderHook(() => useKeyboardHeight())

  // endCoordinates.height is -1 here; only screenY (→ 320) must drive the value.
  act(() => handlers.keyboardDidShow(showEvent(320)))
  expect(result.current).toBe(320)
})

test('will* events drive it too (iOS moves with the keyboard)', () => {
  const { handlers } = captureListeners()
  const { result } = renderHook(() => useKeyboardHeight())

  act(() => handlers.keyboardWillShow(showEvent(291)))
  expect(result.current).toBe(291)
  act(() => handlers.keyboardWillHide(showEvent(0)))
  expect(result.current).toBe(0)
})

test('detaches every listener on unmount', () => {
  const { remove } = captureListeners()
  const { unmount } = renderHook(() => useKeyboardHeight())

  unmount()
  expect(remove).toHaveBeenCalledTimes(4)
})
