import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Aliased: this is the SETUP MOCK's accessor, not a hook call.
import { useRouter as routerMockAccessor } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Home } from 'lucide-react'

import {
  CommandPalette,
  PALETTE_EMPTY_COPY,
  type PaletteCommand,
} from '@/components/app/workspace/palette'

const router = vi.mocked(routerMockAccessor())

const command = (label: string, href = `/${label.toLowerCase()}`): PaletteCommand => ({
  id: `c:${label}`,
  label,
  hint: 'go',
  href,
  icon: Home,
})

const COMMANDS = [command('Home'), command('Messages'), command('Wallet')]

function open(onClose = vi.fn()) {
  render(<CommandPalette commands={COMMANDS} onClose={onClose} />)
  return onClose
}

const input = () => screen.getByRole('combobox')
const options = () => screen.getAllByRole('option')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CommandPalette — structure', () => {
  it('is a labelled modal dialog', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
  })

  it('focuses the query field on open, so you can type immediately', () => {
    open()
    expect(input()).toHaveFocus()
  })

  it('lists every command before anything is typed', () => {
    open()
    expect(options()).toHaveLength(COMMANDS.length)
  })

  it('pairs the input with the listbox for assistive tech', () => {
    open()
    const listbox = screen.getByRole('listbox', { name: 'Results' })
    expect(input()).toHaveAttribute('aria-controls', listbox.id)
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('announces the result count to a reader who cannot see the list change', () => {
    open()
    expect(screen.getByRole('status')).toHaveTextContent('3 results')
  })

  it('announces a singular result correctly', async () => {
    open()
    await userEvent.type(input(), 'wallet')
    expect(screen.getByRole('status')).toHaveTextContent('1 result')
  })
})

describe('CommandPalette — filtering', () => {
  it('narrows as you type', async () => {
    open()
    await userEvent.type(input(), 'mess')
    expect(options()).toHaveLength(1)
    expect(within(options()[0]).getByText('Messages')).toBeInTheDocument()
  })

  it('shows the empty copy when nothing matches, not a blank box', async () => {
    open()
    await userEvent.type(input(), 'zzzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(PALETTE_EMPTY_COPY)).toBeInTheDocument()
  })
})

describe('CommandPalette — keyboard', () => {
  it('starts with the first result active', () => {
    open()
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('moves the virtual cursor with the arrow keys, keeping focus in the input', async () => {
    open()
    await userEvent.keyboard('{ArrowDown}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    // Focus must NOT move into the list, or typing would stop working.
    expect(input()).toHaveFocus()
  })

  it('points aria-activedescendant at the active option', async () => {
    open()
    await userEvent.keyboard('{ArrowDown}')
    expect(input()).toHaveAttribute('aria-activedescendant', options()[1].id)
  })

  it('clamps at both ends instead of wrapping', async () => {
    open()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(options()[COMMANDS.length - 1]).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates to the active command on Enter and closes', async () => {
    const onClose = open()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/messages')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does nothing on Enter when nothing matches', async () => {
    const onClose = open()
    await userEvent.type(input(), 'zzzz')
    await userEvent.keyboard('{Enter}')
    expect(router.push).not.toHaveBeenCalled()
    // Also assert the palette stays OPEN: acting on an undefined command
    // closes first and only then fails on the href, which a
    // router-only assertion cannot distinguish from doing nothing.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('resets the cursor to the top when the query changes', async () => {
    open()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await userEvent.type(input(), 'e')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('pulls the cursor back in when the command source shrinks under it', async () => {
    // Typing resets the cursor, so a query change can never exercise this.
    // A shrinking SOURCE can — which is what happens once escrows and
    // conversations stream in and then filter down.
    const onClose = vi.fn()
    const { rerender } = render(<CommandPalette commands={COMMANDS} onClose={onClose} />)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}') // third result
    expect(options()[2]).toHaveAttribute('aria-selected', 'true')

    rerender(<CommandPalette commands={[COMMANDS[0]]} onClose={onClose} />)
    expect(options()).toHaveLength(1)
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/home')
  })

  it('closes on Escape without navigating', async () => {
    const onClose = open()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('CommandPalette — pointer', () => {
  it('navigates on click', async () => {
    const onClose = open()
    await userEvent.click(screen.getByText('Wallet'))
    expect(router.push).toHaveBeenCalledWith('/wallet')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hovering moves the same cursor the keyboard uses', async () => {
    open()
    await userEvent.hover(screen.getByText('Wallet'))
    expect(options()[2]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/wallet')
  })
})

describe('CommandPalette — IME composition', () => {
  it('does not navigate on the Enter that commits a composition', () => {
    // A CJK reader's first Enter commits the candidate. Treating it as
    // "open the result" navigates them away mid-word.
    open()
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('leaves the arrows to the candidate list while composing', () => {
    open()
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true })
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('still works normally once the composition has ended', async () => {
    open()
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true })
    await userEvent.keyboard('{ArrowDown}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/messages')
  })
})
