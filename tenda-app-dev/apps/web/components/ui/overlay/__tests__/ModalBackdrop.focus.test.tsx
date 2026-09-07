/**
 * Focus management for the one overlay skeleton. `aria-modal="true"` promises
 * the rest of the page is inert; these are the tests that make the promise
 * true rather than decorative.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'

function Card({ initialFocus }: { initialFocus?: 'first' | 'last' | 'card' }) {
  return (
    <ModalBackdrop label="Pick" initialFocus={initialFocus}>
      <button type="button">First</button>
      <button type="button">Middle</button>
      <button type="button">Last</button>
    </ModalBackdrop>
  )
}

describe('initial focus', () => {
  it('lands on the card by default — safe when a control would be a loaded gun', () => {
    render(<Card />)
    expect(screen.getByRole('dialog', { name: 'Pick' })).toHaveFocus()
  })

  it('lands on the first control when asked', () => {
    render(<Card initialFocus="first" />)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('lands on the last control when asked', () => {
    render(<Card initialFocus="last" />)
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('falls back to the card when the requested control does not exist yet', () => {
    // Async dialog content: nothing focusable on the first paint. Focus must
    // not be left outside a modal.
    render(
      <ModalBackdrop label="Loading" initialFocus="first">
        <p>fetching…</p>
      </ModalBackdrop>,
    )
    expect(screen.getByRole('dialog', { name: 'Loading' })).toHaveFocus()
  })
})

describe('focus trap', () => {
  it('wraps forward from the last control to the first', async () => {
    render(<Card initialFocus="last" />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('wraps backward from the first control to the last', async () => {
    render(<Card initialFocus="first" />)
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('does not escape a dialog that has no controls at all', async () => {
    render(
      <>
        <button type="button">outside</button>
        <ModalBackdrop label="Empty">
          <p>nothing focusable</p>
        </ModalBackdrop>
      </>,
    )
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'outside' })).not.toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Empty' })).toHaveFocus()
  })

  it('moves normally between controls in the middle of the card', async () => {
    render(<Card initialFocus="first" />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus()
  })
})

describe('focus restore', () => {
  it('returns focus to whatever opened the dialog', () => {
    // Mirrors how a dialog really opens: the opener holds focus, THEN the
    // card mounts. Focusing after mount would miss the captured value.
    const Harness = ({ open }: { open: boolean }) => (
      <>
        <button type="button">opener</button>
        {open && (
          <ModalBackdrop label="Pick" initialFocus="first">
            <button type="button">inside</button>
          </ModalBackdrop>
        )}
      </>
    )
    const { rerender } = render(<Harness open={false} />)
    screen.getByRole('button', { name: 'opener' }).focus()

    rerender(<Harness open />)
    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus()

    rerender(<Harness open={false} />)
    expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus()
  })
})

describe('escape', () => {
  it('dismisses when opted in', async () => {
    const onBackdropClick = vi.fn()
    render(
      <ModalBackdrop label="Pick" onBackdropClick={onBackdropClick}>
        <button type="button">inside</button>
      </ModalBackdrop>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onBackdropClick).toHaveBeenCalledOnce()
  })

  it('is inert on a dialog that opted out of dismissal', async () => {
    render(
      <ModalBackdrop label="Progress">
        <button type="button">inside</button>
      </ModalBackdrop>,
    )
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Progress' })).toBeInTheDocument()
  })
})
