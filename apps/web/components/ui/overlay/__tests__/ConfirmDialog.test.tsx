/** ConfirmDialog: render gating, Escape + backdrop cancel, busy lockout. */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '@/components/ui'

function setup(over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      open
      title="Unlink wallet"
      message="Sure?"
      confirmLabel="Unlink"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog open={false} title="T" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('confirms and cancels through the buttons', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape and a backdrop click both cancel; a click INSIDE does not', async () => {
    const { onCancel } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByText('Sure?'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('busy disables both buttons and swaps the confirm label', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('busy locks EVERY way out — Escape and the backdrop stop cancelling too', async () => {
    // The Cancel button is disabled while busy; letting Escape/backdrop slip
    // through would tear the dialog down mid-operation.
    const { onCancel } = setup({ busy: true })
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('presentation'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('ConfirmDialog — comps additions', () => {
  it('renders the money figure when given one', () => {
    render(
      <ConfirmDialog
        open
        title="Fund this gig"
        message="Locks the amount in escrow."
        figure="120.00 USDC"
        confirmLabel="Sign"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('120.00 USDC')).toBeInTheDocument()
  })

  it('omits the figure line entirely when there is no amount', () => {
    render(
      <ConfirmDialog open title="Cancel gig" confirmLabel="Yes" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.queryByText(/USDC/)).not.toBeInTheDocument()
  })

  it('focuses Cancel on a destructive gate, so a stray Enter cannot fire it', () => {
    render(
      <ConfirmDialog
        open
        destructive
        title="Delete draft"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('focuses Confirm on a benign gate', () => {
    render(
      <ConfirmDialog open title="Apply" confirmLabel="Apply" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus()
  })

  it('renders the extra slot, and its controls never steal the initial focus', () => {
    // The tx gate mounts a Switch-wallet button here; positional first/last
    // focus would land on it — the explicit anchors keep the contract.
    render(
      <ConfirmDialog
        open
        destructive
        title="Cancel gig"
        confirmLabel="Cancel gig"
        extra={<button type="button">Switch</button>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Switch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('a benign gate with extra controls still focuses Confirm', () => {
    render(
      <ConfirmDialog
        open
        title="Apply"
        confirmLabel="Apply"
        extra={<button type="button">Switch</button>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus()
  })

  it('a destructive Enter cancels rather than confirms', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        destructive
        title="Delete draft"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    await userEvent.keyboard('{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })
})
