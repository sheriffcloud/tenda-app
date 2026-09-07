/**
 * The two whole-page states and the banner that precedes one of them.
 *
 * What is being pinned here is what each screen CLAIMS. The error screen's job
 * is to say that nothing the reader cannot see moved; the offline screen's is
 * to say which of their things still work. Both are promises, so both are
 * asserted rather than left to a snapshot.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RouteError from '@/app/error'
import { OfflinePanel } from '@/components/app/status/OfflinePanel'
import { OfflineNotice } from '@/components/app/status/OfflineNotice'
import { ERROR_COPY, OFFLINE_COPY } from '@/components/app/status/copy'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

afterEach(() => {
  cleanup()
  setOnline(true)
})

describe('RouteError', () => {
  const err = (digest?: string) => Object.assign(new Error('boom'), { digest })

  it('says the failure is the VIEW, not the money', () => {
    render(<RouteError error={err()} reset={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ERROR_COPY.title)
    expect(screen.getByText(ERROR_COPY.body)).toBeInTheDocument()
  })

  it('retries the RENDER rather than reloading the document', () => {
    // A reload discards the client session state the reader is mid-way
    // through; the failure is usually one bad render, not a bad document.
    const reset = vi.fn()
    render(<RouteError error={err()} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: ERROR_COPY.retry }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('prints the digest when there is one, and no empty label when there is not', () => {
    const { unmount } = render(<RouteError error={err('8f21a4c0')} reset={vi.fn()} />)
    expect(screen.getByText(ERROR_COPY.trace('8f21a4c0'))).toBeInTheDocument()
    unmount()

    render(<RouteError error={err()} reset={vi.fn()} />)
    expect(screen.queryByText(/Trace/)).toBeNull()
  })

  it('offers a way out that does not depend on this screen rendering again', () => {
    render(<RouteError error={err()} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: ERROR_COPY.home })).toHaveAttribute('href', '/welcome')
  })
})

describe('OfflinePanel', () => {
  it('lists what still works, including the thing that never does', () => {
    render(<OfflinePanel />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(OFFLINE_COPY.title)
    for (const line of OFFLINE_COPY.available) {
      expect(screen.getByText(line)).toBeInTheDocument()
    }
  })

  it('re-attempts the boot fetches rather than navigating', () => {
    // A soft navigation to the route the app already thinks it is on does
    // nothing at all; the reader is here because the NETWORK failed.
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, reload },
      configurable: true,
    })
    render(<OfflinePanel />)
    fireEvent.click(screen.getByRole('button', { name: OFFLINE_COPY.retry }))
    expect(reload).toHaveBeenCalledTimes(1)
    Object.defineProperty(window, 'location', { value: original, configurable: true })
  })
})

describe('OfflineNotice', () => {
  it('renders nothing while the browser has a connection', () => {
    const { container } = render(<OfflineNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('appears when the connection drops, without a reload', () => {
    render(<OfflineNotice />)
    setOnline(false)
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_COPY.banner)
  })

  it('goes away again when the connection returns', () => {
    setOnline(false)
    render(<OfflineNotice />)
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('status')).toBeInTheDocument()

    setOnline(true)
    fireEvent(window, new Event('online'))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('is a status, not an alert', () => {
    // A change in conditions, not a response to something the reader did — an
    // assertive interrupt in every tunnel is noise.
    setOnline(false)
    render(<OfflineNotice />)
    fireEvent(window, new Event('offline'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
