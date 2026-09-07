import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useCommandPalette } from '@/hooks/workspace/useCommandPalette'
import {
  openCommandPalette,
  resetCommandPaletteForTests,
} from '@/components/app/workspace/palette'

function Host() {
  const { open } = useCommandPalette()
  return <output data-testid="state">{open ? 'open' : 'closed'}</output>
}

const state = () => screen.getByTestId('state').textContent

beforeEach(() => {
  resetCommandPaletteForTests()
})
afterEach(() => {
  // Inside `act`, because this hook subscribes to a module store: the reset
  // emits, the still-mounted Host re-renders, and this hook runs BEFORE
  // RTL's cleanup. Only the tests that end with the palette OPEN ever warned
  // — a reset that does not change the snapshot re-renders nothing — which
  // is exactly the four `useSyncExternalStore` saw a new value for.
  act(() => {
    resetCommandPaletteForTests()
  })
})

describe('useCommandPalette', () => {
  it('starts closed', () => {
    render(<Host />)
    expect(state()).toBe('closed')
  })

  it('opens on Cmd-K', async () => {
    render(<Host />)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(state()).toBe('open')
  })

  it('opens on Ctrl-K, for readers who are not on a Mac', async () => {
    render(<Host />)
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(state()).toBe('open')
  })

  it('toggles shut on a second press, so the chord is its own escape', async () => {
    render(<Host />)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(state()).toBe('closed')
  })

  it('ignores a bare k, which is ordinary typing', async () => {
    render(<Host />)
    await userEvent.keyboard('k')
    expect(state()).toBe('closed')
  })

  it('ignores other chords', async () => {
    render(<Host />)
    await userEvent.keyboard('{Meta>}j{/Meta}')
    expect(state()).toBe('closed')
  })

  it('fires even while a field has focus — the chord is not typing', async () => {
    render(
      <>
        <Host />
        <input aria-label="filter" />
      </>,
    )
    const field = screen.getByLabelText('filter')
    await field.focus()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(state()).toBe('open')
  })

  it('reflects state opened from elsewhere, without a React context', () => {
    // The list column's button lives in a parallel-route slot, a sibling of
    // the palette host — the module store is what lets it reach across.
    render(<Host />)
    expect(state()).toBe('closed')
    act(() => {
      openCommandPalette()
    })
    expect(state()).toBe('open')
  })

  it('releases the shortcut listener on unmount', async () => {
    const { unmount } = render(<Host />)
    unmount()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    render(<Host />)
    expect(state()).toBe('closed')
  })
})
