import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GIGS_VIEW,
  GIGS_VIEW_KEY,
  isGigsView,
  resetGigsViewForTests,
  setGigsView,
  useGigsView,
} from '@/lib/gigs/browse-view'

function Probe() {
  const [view, setView] = useGigsView()
  return (
    <button type="button" onClick={() => setView(view === 'list' ? 'grid' : 'list')}>
      {view}
    </button>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetGigsViewForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gigs browse view', () => {
  it('defaults to the list, which is also what the server renders', () => {
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent(DEFAULT_GIGS_VIEW)
    expect(DEFAULT_GIGS_VIEW).toBe('list')
  })

  it('remembers the choice in localStorage and answers it on the next mount', () => {
    const { unmount } = render(<Probe />)
    act(() => {
      screen.getByRole('button').click()
    })
    expect(screen.getByRole('button')).toHaveTextContent('grid')
    expect(window.localStorage.getItem(GIGS_VIEW_KEY)).toBe('grid')
    unmount()
    resetGigsViewForTests()
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('grid')
  })

  it('every subscriber sees a change, wherever on the page it sits', () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    )
    act(() => {
      setGigsView('grid')
    })
    for (const button of screen.getAllByRole('button')) expect(button).toHaveTextContent('grid')
  })

  it('ignores a stored value that is not a view, rather than rendering it', () => {
    window.localStorage.setItem(GIGS_VIEW_KEY, 'carousel')
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('list')
    expect(isGigsView('carousel')).toBe(false)
    expect(isGigsView('grid')).toBe(true)
    expect(isGigsView(null)).toBe(false)
  })

  it('survives a storage that throws — a private window, a blocked store', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('list')
    act(() => {
      screen.getByRole('button').click()
    })
    // The choice holds for the page even though it could not be written.
    expect(screen.getByRole('button')).toHaveTextContent('grid')
  })

  it('setting the view it already holds writes nothing and wakes nobody', () => {
    // The render count alone cannot witness this: React bails out on an
    // unchanged snapshot whether or not the store fired. The storage write is
    // the observable half — proved by removing the guard, which writes again.
    const renders = vi.fn()
    function Counter() {
      renders()
      const [view] = useGigsView()
      return <span>{view}</span>
    }
    render(<Counter />)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const before = renders.mock.calls.length
    act(() => {
      setGigsView('list')
    })
    expect(setItem).not.toHaveBeenCalled()
    expect(renders.mock.calls.length).toBe(before)
  })
})
