/**
 * Which clock the offer page is showing.
 *
 * The comp draws ONE — the payment window — because it draws one state. A real
 * offer moves through three, each with its own deadline, so a single hardcoded
 * window would be counting the wrong thing on two of them.
 */
import { describe, expect, it } from 'vitest'
import { exchangeChatContext, offerClockFor } from '@/components/exchange/detail'
import { makeExchangeDetail } from '../../../../test/factories/exchange'

describe('offerClockFor', () => {
  it('counts to the offer closing while it is open', () => {
    const clock = offerClockFor(
      makeExchangeDetail({ status: 'open', accept_deadline: '2026-08-20T10:00:00.000Z' }),
      'buyer',
    )
    expect(clock?.kind).toBe('accept')
    expect(clock?.deadline?.toISOString()).toBe('2026-08-20T10:00:00.000Z')
  })

  it('counts the PAYMENT window once accepted', () => {
    const clock = offerClockFor(
      makeExchangeDetail({ status: 'accepted', completion_deadline: '2026-08-16T11:00:00.000Z' }),
      'buyer',
    )
    expect(clock?.kind).toBe('pay')
    expect(clock?.deadline?.toISOString()).toBe('2026-08-16T11:00:00.000Z')
  })

  it('counts the SELLER’s confirmation window once payment is submitted', () => {
    const clock = offerClockFor(
      makeExchangeDetail({ status: 'submitted', approval_deadline: '2026-08-18T11:00:00.000Z' }),
      'buyer',
    )
    expect(clock?.kind).toBe('confirm')
    expect(clock?.deadline?.toISOString()).toBe('2026-08-18T11:00:00.000Z')
  })

  it('states the window STATICALLY on an open offer that never closes', () => {
    // `accept_deadline` is nullable, and a live clock counting to nothing is
    // not an option — but the window is still what the reader is deciding on.
    const clock = offerClockFor(
      makeExchangeDetail({ status: 'open', accept_deadline: null, payment_window_seconds: 5_400 }),
      'buyer',
    )
    expect(clock?.kind).toBe('window')
    expect(clock?.deadline).toBeNull()
    expect(clock?.staticValue).toBe('1h 30m')
  })

  it('shows no clock at all once the escrow has stopped moving', () => {
    for (const status of ['completed', 'cancelled', 'refunded', 'disputed', 'resolved', 'draft'] as const) {
      expect(offerClockFor(makeExchangeDetail({ status }), 'buyer')).toBeNull()
    }
  })

  it('gives every clock its own label AND its own advice', () => {
    const kinds = (['open', 'accepted', 'submitted'] as const).map((status) =>
      offerClockFor(
        makeExchangeDetail({
          status,
          accept_deadline: '2026-08-20T10:00:00.000Z',
          completion_deadline: '2026-08-16T11:00:00.000Z',
          approval_deadline: '2026-08-18T11:00:00.000Z',
        }),
        'buyer',
      ),
    )
    const labels = kinds.map((clock) => clock?.label)
    const notes = kinds.map((clock) => clock?.note)
    expect(new Set(labels).size).toBe(3)
    expect(new Set(notes).size).toBe(3)
  })
})

describe('exchangeChatContext', () => {
  it('names the trade the way the SERVER names it on a message', () => {
    // `'Trade: ' || fiat_amount || ' ' || fiat_currency` in the conversations
    // route. Two spellings would put two different dividers on one thread.
    expect(exchangeChatContext(makeExchangeDetail())).toEqual({
      id: 'exch-1',
      title: 'Trade: 75000.0000 NGN',
      kind: 'exchange',
    })
  })
})

describe('offerClockFor — whose clock is it', () => {
  const clock = (status: 'open' | 'accepted' | 'submitted', seat: 'buyer' | 'seller') =>
    offerClockFor(
      makeExchangeDetail({
        status,
        accept_deadline: '2026-08-20T10:00:00.000Z',
        completion_deadline: '2026-08-16T11:00:00.000Z',
        approval_deadline: '2026-08-18T11:00:00.000Z',
      }),
      seat,
    )

  it('never tells the SELLER to pay — it is the buyer who pays fiat', () => {
    // The block is rendered to both parties. A seller on an accepted offer was
    // shown "Pay within 0:59:00 — miss this and the trade cancels itself":
    // an instruction to pay, given to the person being paid.
    const seller = clock('accepted', 'seller')
    expect(seller?.label).not.toMatch(/^Pay within/)
    expect(seller?.note).not.toMatch(/Miss this/)
    expect(clock('accepted', 'buyer')?.label).toBe('Pay within')
  })

  it('never offers the SELLER a claim only the buyer can make', () => {
    // "If they do not, you can claim the crypto out of escrow yourself" is the
    // buyer's remedy against a silent seller. Told to the seller it describes
    // them claiming their own escrow back from themselves.
    const seller = clock('submitted', 'seller')
    expect(seller?.note).not.toMatch(/you can claim/)
    expect(clock('submitted', 'buyer')?.note).toMatch(/you can claim/)
  })

  it('gives each seat its own words on every live status', () => {
    for (const status of ['open', 'accepted', 'submitted'] as const) {
      const buyer = clock(status, 'buyer')
      const seller = clock(status, 'seller')
      expect(seller?.kind, status).toBe(buyer?.kind)
      expect(seller?.note, status).not.toBe(buyer?.note)
    }
  })

  it('states the un-started window from the seat that is reading it', () => {
    const open = { status: 'open' as const, accept_deadline: null, payment_window_seconds: 3_600 }
    expect(offerClockFor(makeExchangeDetail(open), 'buyer')?.note).toMatch(/you get to pay/)
    expect(offerClockFor(makeExchangeDetail(open), 'seller')?.note).toMatch(/the buyer gets to pay/)
  })
})
