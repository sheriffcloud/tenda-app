/**
 * The AppState shim's contract: change events fire the callback (never on
 * mount, matching AppState 'change' semantics), the returned boolean
 * tracks live state, and the point read counts a document-less render as
 * visible so SSR never blocks on it.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { isDocumentVisible, useDocumentVisibility } from '@/hooks/connectivity/useDocumentVisibility'

let visibilityState: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibilityState,
})

function setVisibility(next: DocumentVisibilityState) {
  visibilityState = next
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  visibilityState = 'visible'
})

test('reports visible initially and never fires the callback on mount', () => {
  const onChange = vi.fn()
  const { result } = renderHook(() => useDocumentVisibility(onChange))
  expect(result.current).toBe(true)
  expect(onChange).not.toHaveBeenCalled()
})

test('tracks hide/show transitions and reports each to the callback', () => {
  const onChange = vi.fn()
  const { result } = renderHook(() => useDocumentVisibility(onChange))

  act(() => setVisibility('hidden'))
  expect(result.current).toBe(false)
  expect(onChange).toHaveBeenLastCalledWith(false)

  act(() => setVisibility('visible'))
  expect(result.current).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith(true)
  expect(onChange).toHaveBeenCalledTimes(2)
})

test('the latest callback is used without re-binding the listener', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = renderHook(({ cb }) => useDocumentVisibility(cb), {
    initialProps: { cb: first },
  })
  rerender({ cb: second })
  act(() => setVisibility('hidden'))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith(false)
})

test('unmount removes the listener', () => {
  const onChange = vi.fn()
  const { unmount } = renderHook(() => useDocumentVisibility(onChange))
  unmount()
  act(() => setVisibility('hidden'))
  expect(onChange).not.toHaveBeenCalled()
})

test('a mount while already hidden corrects the initial optimistic value', () => {
  visibilityState = 'hidden'
  const { result } = renderHook(() => useDocumentVisibility())
  expect(result.current).toBe(false)
})

test('isDocumentVisible reads the live document state', () => {
  expect(isDocumentVisible()).toBe(true)
  visibilityState = 'hidden'
  expect(isDocumentVisible()).toBe(false)
})
