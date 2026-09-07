/**
 * The toast layer — module-level queue + host: render, click-dismiss,
 * auto-dismiss, and the visible cap.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ToastHost, clearToastsForTests, showToast } from '@/components/ui/Toast'

afterEach(() => {
  act(() => clearToastsForTests())
  vi.useRealTimers()
})

test('showToast renders in the host and click dismisses', () => {
  render(<ToastHost />)
  act(() => showToast('success', 'Gig funded and live!'))
  const toast = screen.getByText('Gig funded and live!')
  expect(toast).toBeInTheDocument()
  fireEvent.click(toast)
  expect(screen.queryByText('Gig funded and live!')).not.toBeInTheDocument()
})

test('toasts auto-dismiss on their type window — errors read longest', () => {
  vi.useFakeTimers()
  render(<ToastHost />)
  act(() => showToast('info', 'Saved'))
  act(() => showToast('error', 'Broadcast failed'))
  // Just short of the info window: both still up — the old 4s window is gone.
  act(() => vi.advanceTimersByTime(5_999))
  expect(screen.getByText('Saved')).toBeInTheDocument()
  // Past it: the info goes, the error stays — its window is longer.
  act(() => vi.advanceTimersByTime(2))
  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  expect(screen.getByText('Broadcast failed')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(2_000))
  expect(screen.queryByText('Broadcast failed')).not.toBeInTheDocument()
})

test('hovering pauses the clock; leaving restarts the FULL window', () => {
  vi.useFakeTimers()
  render(<ToastHost />)
  act(() => showToast('info', 'Saved'))
  const toast = screen.getByRole('status')
  fireEvent.mouseEnter(toast)
  // Way past every window: still here, because someone is reading it.
  act(() => vi.advanceTimersByTime(60_000))
  expect(screen.getByText('Saved')).toBeInTheDocument()
  fireEvent.mouseLeave(toast)
  act(() => vi.advanceTimersByTime(5_999))
  expect(screen.getByText('Saved')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(2))
  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
})

test('the explicit ✕ dismisses — the keyboard path the clickable card lacks', () => {
  render(<ToastHost />)
  act(() => showToast('error', 'Broadcast failed'))
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText('Broadcast failed')).not.toBeInTheDocument()
})

test('only the newest toasts stay visible (cap)', () => {
  render(<ToastHost />)
  act(() => {
    showToast('info', 'one')
    showToast('info', 'two')
    showToast('info', 'three')
    showToast('info', 'four')
  })
  expect(screen.queryByText('one')).not.toBeInTheDocument()
  expect(screen.getByText('two')).toBeInTheDocument()
  expect(screen.getByText('four')).toBeInTheDocument()
})

test('a toast fired BEFORE the host mounts still renders (module-level queue)', () => {
  act(() => showToast('error', 'early bird'))
  render(<ToastHost />)
  expect(screen.getByText('early bird')).toBeInTheDocument()
})
