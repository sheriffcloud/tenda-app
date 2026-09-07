/**
 * ui/overlay/ModalBackdrop — the one overlay skeleton. Positive: aria
 * contract + backdrop dismissal when opted in. Negative: clicks on the CARD
 * never dismiss, and omitting onBackdropClick makes the backdrop inert.
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'

describe('ModalBackdrop', () => {
  it('renders the labelled dialog card with the given role', () => {
    render(
      <ModalBackdrop role="alertdialog" label="Danger zone">
        <p>content</p>
      </ModalBackdrop>,
    )
    const dialog = screen.getByRole('alertdialog', { name: 'Danger zone' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('backdrop click dismisses when opted in; card clicks never do', () => {
    const onBackdropClick = vi.fn()
    render(
      <ModalBackdrop label="Pick" onBackdropClick={onBackdropClick}>
        <p>inside</p>
      </ModalBackdrop>,
    )
    fireEvent.click(screen.getByText('inside'))
    expect(onBackdropClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('presentation'))
    expect(onBackdropClick).toHaveBeenCalledTimes(1)
  })

  it('without onBackdropClick the backdrop is inert', () => {
    cleanup()
    render(
      <ModalBackdrop label="Progress" strongDim>
        <p>working</p>
      </ModalBackdrop>,
    )
    // No handler wired — clicking the dim layer must not throw or dismiss.
    fireEvent.click(screen.getByRole('presentation'))
    expect(screen.getByText('working')).toBeInTheDocument()
  })
})
