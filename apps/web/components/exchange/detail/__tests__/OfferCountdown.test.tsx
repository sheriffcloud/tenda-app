/**
 * The countdown block, whose whole job is that the reader does not have to
 * read the digits to know how much trouble they are in.
 *
 * The thresholds are shared's (`countdownTone`), so a change there moves this
 * panel and the inline clock together — which is the reason they were made to
 * share a hook in the first place.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OFFER_COUNTDOWN_COPY, OfferCountdown, offerClockFor } from '@/components/exchange/detail'
import { makeExchangeDetail } from '../../../../test/factories/exchange'

const clockAt = (deadline: string) =>
  offerClockFor(makeExchangeDetail({ status: 'accepted', completion_deadline: deadline }), 'buyer')!

const panel = () => document.querySelector('[data-offer-countdown]')!

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('OfferCountdown', () => {
  it('ticks', () => {
    render(<OfferCountdown clock={clockAt('2026-08-16T10:00:05.000Z')} />)
    expect(screen.getByText('0:00:05')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(screen.getByText('0:00:03')).toBeInTheDocument()
  })

  it('shifts the whole PANEL through the shared urgency tones', () => {
    const { rerender } = render(<OfferCountdown clock={clockAt('2026-08-16T13:00:00.000Z')} />)
    expect(panel().className).toContain('bg-surface-inset')

    rerender(<OfferCountdown clock={clockAt('2026-08-16T11:00:00.000Z')} />)
    expect(panel().className).toContain('bg-feedback-warning-surface')

    rerender(<OfferCountdown clock={clockAt('2026-08-16T10:10:00.000Z')} />)
    expect(panel().className).toContain('bg-feedback-danger-surface')
  })

  it('stops at zero and drops advice that is no longer advice', () => {
    const clock = clockAt('2026-08-16T10:00:02.000Z')
    render(<OfferCountdown clock={clock} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText(OFFER_COUNTDOWN_COPY.expiredValue)).toBeInTheDocument()
    // "Miss this and the trade cancels itself" is not something to tell
    // someone who already missed it.
    expect(screen.queryByText(clock.note)).toBeNull()
    expect(screen.getByText(OFFER_COUNTDOWN_COPY.expiredNote)).toBeInTheDocument()
  })

  it('names what is being counted, for a reader who cannot see the panel', () => {
    const clock = clockAt('2026-08-16T11:00:00.000Z')
    render(<OfferCountdown clock={clock} />)
    // The digits alone are a number with no subject.
    expect(screen.getByText(`${clock.label}:`, { exact: false })).toBeInTheDocument()
  })

  it('renders a window that has not started as neutral, with no clock running', () => {
    const clock = offerClockFor(
      makeExchangeDetail({ status: 'open', accept_deadline: null, payment_window_seconds: 3_600 }),
      'buyer',
    )!
    render(<OfferCountdown clock={clock} />)
    expect(screen.getByText('1h')).toBeInTheDocument()
    // Nothing is running out, so nothing should look like it is.
    expect(panel().className).toContain('bg-surface-inset')
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.getByText('1h')).toBeInTheDocument()
  })
})
