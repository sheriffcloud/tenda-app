/**
 * TransactionMonitor phase UX (port of the mobile suite's key cases) plus
 * the web-specific behavior: beforeunload registered ONLY while a signature
 * is in flight, the navigator.onLine caption swap, and the Cancel button
 * driven by the real shared guarded-request registry.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TRANSACTION_COPY,
  abortPendingWalletRequest,
  guardWalletRequest,
} from '@tenda/shared'

// Escrow-sync is unit-tested on its own; here it's a controllable stub.
const syncState = { current: { state: 'waiting', failure: '' } }
vi.mock('@/hooks/escrow/sync/useEscrowTransactionSync', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/hooks/escrow/sync/useEscrowTransactionSync')),
  useEscrowTransactionSync: () => syncState.current,
}))

import { TransactionMonitor } from '@/components/escrow/TransactionMonitor'

const noop = () => {}
const notApplied = async () => false

beforeEach(() => {
  syncState.current = { state: 'waiting', failure: '' }
})

afterEach(() => {
  abortPendingWalletRequest()
  vi.useRealTimers()
})

describe('phase display', () => {
  it('idle phase with no signature renders nothing', () => {
    const { container } = render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="idle" onConfirmed={noop} onFailed={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('preparing shows the build copy; preparingCaption overrides it (moderation wait)', () => {
    const { rerender } = render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="preparing" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.getByText(TRANSACTION_COPY.preparingTitle)).toBeInTheDocument()
    expect(screen.getByText(TRANSACTION_COPY.preparingCaption)).toBeInTheDocument()

    const caption = 'Reviewing your gig against our guidelines.'
    rerender(
      <TransactionMonitor
        checkApplied={notApplied}
        signature={null}
        phase="preparing"
        preparingCaption={caption}
        onConfirmed={noop}
        onFailed={noop}
      />,
    )
    expect(screen.getByText(caption)).toBeInTheDocument()
    expect(screen.queryByText(TRANSACTION_COPY.preparingCaption)).not.toBeInTheDocument()
  })

  it('signing tells the user their wallet is opening (the key newcomer cue)', () => {
    render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="signing" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.getByText(TRANSACTION_COPY.signingTitle)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('confirming names the action via actionLabel', () => {
    render(
      <TransactionMonitor
        checkApplied={notApplied}
        signature="sig123"
        phase="confirming"
        actionLabel="Releasing payment"
        onConfirmed={noop}
        onFailed={noop}
      />,
    )
    expect(screen.getByText('Releasing payment…')).toBeInTheDocument()
  })

  it('a broadcast signature opens the modal even without a phase (legacy caller)', () => {
    render(
      <TransactionMonitor checkApplied={notApplied} signature="sig123" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.getByText(TRANSACTION_COPY.confirmingTitle)).toBeInTheDocument()
  })

  it('syncing swaps to the server-sync copy; applied shows success', () => {
    syncState.current = { state: 'syncing', failure: '' }
    const { rerender } = render(
      <TransactionMonitor checkApplied={notApplied} signature="sig" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.getByText(TRANSACTION_COPY.syncingTitle)).toBeInTheDocument()

    syncState.current = { state: 'applied', failure: '' }
    rerender(<TransactionMonitor checkApplied={notApplied} signature="sig" onConfirmed={noop} onFailed={noop} />)
    expect(screen.getByText('Transaction confirmed!')).toBeInTheDocument()
  })

  it('applied fires onConfirmed after the dismiss delay', () => {
    vi.useFakeTimers()
    const onConfirmed = vi.fn()
    syncState.current = { state: 'applied', failure: '' }
    render(<TransactionMonitor checkApplied={notApplied} signature="sig" onConfirmed={onConfirmed} onFailed={noop} />)
    expect(onConfirmed).not.toHaveBeenCalled()
    act(() => vi.runOnlyPendingTimers())
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('failed shows the failure with a Dismiss that reports it', () => {
    const onFailed = vi.fn()
    syncState.current = { state: 'failed', failure: 'Transaction failed on chain.' }
    render(<TransactionMonitor checkApplied={notApplied} signature="sig" onConfirmed={noop} onFailed={onFailed} />)
    expect(screen.getByText('Transaction issue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onFailed).toHaveBeenCalledWith('Transaction failed on chain.')
  })

  it('deferred keeps spinning with a Continue exit', () => {
    const onFailed = vi.fn()
    syncState.current = { state: 'deferred', failure: 'Still syncing.' }
    render(<TransactionMonitor checkApplied={notApplied} signature="sig" onConfirmed={noop} onFailed={onFailed} />)
    expect(screen.getByText(TRANSACTION_COPY.deferredTitle)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onFailed).toHaveBeenCalledWith('Still syncing.')
  })
})

describe('Cancel rides the REAL guarded-request registry', () => {
  it('appears while a guarded request is pending and aborts it', async () => {
    render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="signing" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    let guarded!: Promise<string>
    act(() => {
      guarded = guardWalletRequest(new Promise<string>(() => {}), { disconnect: async () => {} })
    })
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    fireEvent.click(cancel)
    await act(async () => {
      await expect(guarded).rejects.toMatchObject({ code: 'declined' })
    })
  })
})

describe('web-specific behavior', () => {
  it('offline swaps the broadcasting caption', () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get')
    onLine.mockReturnValue(false)
    render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="broadcasting" onConfirmed={noop} onFailed={noop} />,
    )
    expect(screen.getByText(TRANSACTION_COPY.offlineBroadcastCaption)).toBeInTheDocument()

    act(() => {
      onLine.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByText(TRANSACTION_COPY.broadcastingCaption)).toBeInTheDocument()
  })

  it('beforeunload warns ONLY while signing/broadcasting — closed once broadcast', () => {
    const listeners = vi.spyOn(window, 'addEventListener')
    const removals = vi.spyOn(window, 'removeEventListener')
    const countAdds = () => listeners.mock.calls.filter(([type]) => type === 'beforeunload').length
    const countRemovals = () => removals.mock.calls.filter(([type]) => type === 'beforeunload').length

    const { rerender } = render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="preparing" onConfirmed={noop} onFailed={noop} />,
    )
    expect(countAdds()).toBe(0)

    rerender(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="signing" onConfirmed={noop} onFailed={noop} />,
    )
    expect(countAdds()).toBe(1)

    // Broadcast onward is safe — the server converges without this tab.
    rerender(
      <TransactionMonitor checkApplied={notApplied} signature="sig" phase="confirming" onConfirmed={noop} onFailed={noop} />,
    )
    expect(countRemovals()).toBeGreaterThanOrEqual(1)
  })

  it('the beforeunload handler actually blocks (preventDefault contract)', () => {
    render(
      <TransactionMonitor checkApplied={notApplied} signature={null} phase="signing" onConfirmed={noop} onFailed={noop} />,
    )
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
