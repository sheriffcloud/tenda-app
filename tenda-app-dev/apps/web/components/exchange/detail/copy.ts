/**
 * The offer page's strings, and the one derivation that decides which clock
 * the countdown block is showing.
 */
import type { EscrowStatus, ExchangeDetail } from '@tenda/shared'
import { ASSET_META, computeRelevantDeadline, formatDurationShort } from '@tenda/shared'
import type { EscrowChatContext } from '@/lib/chat-href'

/** Which seat the reader is in: 'seller' created this offer, 'buyer' is anyone else. */
export type OfferPerspective = 'buyer' | 'seller'

export const OFFER_DETAIL_COPY = {
  back: 'All offers',
  sideLabel: (asset: string) => `Selling ${ASSET_META[asset]?.symbol ?? asset}`,
  rateUnit: (currency: string, asset: string) =>
    `${currency} per ${ASSET_META[asset]?.symbol ?? asset}`,
  /**
   * The comp says the rate is "fixed the moment you confirm". It is fixed
   * EARLIER than that — the seller set it when they posted, and the escrow
   * carries `fiat_amount` for the whole offer — so confirming does not quote
   * you, it accepts a quote already on the table. Saying otherwise would
   * invite a reader to expect a re-quote that never happens.
   */
  rateNote:
    'The seller fixed this rate when they posted. It does not move while the payment window runs, and it is never re-quoted.',
  trader: 'The person on the other side',
  terms: 'Terms',
  events: 'Order of events',
  /**
   * Every step is a real transition of this escrow, in the order it happens —
   * told from the reader's own seat.
   *
   * One list would be wrong for one of them, and always for the same person:
   * the seller posted this offer, so "you accept" and "you pay the seller"
   * invert all four lines for the only reader who cannot take it. The figures
   * above the list are already perspective-aware; this had to be too.
   */
  steps: {
    buyer: [
      'You accept, and the crypto stays locked in escrow — the seller cannot move it.',
      'The payment window opens and you pay the seller in fiat, off-platform.',
      'You mark the payment sent, attaching your receipt as proof.',
      'The seller confirms the money arrived, and escrow releases the crypto to you.',
    ],
    seller: [
      'A buyer accepts, and the crypto you locked stays in escrow — you cannot move it either.',
      'Their payment window opens and they pay you in fiat, into the payout account on this offer.',
      'They mark the payment sent, attaching their receipt as proof.',
      'You confirm the money arrived, and escrow releases the crypto to them.',
    ],
  } satisfies Record<OfferPerspective, readonly string[]>,
  ctaNote: 'You will see exactly what you are signing, including the fee, before anything is committed.',
  youPay: 'You pay',
  youReceive: 'You receive',
  /** Net of the platform fee — the gross alone misstates what lands. */
  receiveNote: 'After the platform fee. This is what reaches your wallet.',
  proofs: 'Payment proof',
  unavailableTitle: 'Offer not available',
  unavailableBody:
    'It may have been taken by someone else, cancelled, or withdrawn. Nothing of yours was affected.',
  loadFailedTitle: 'This offer could not be loaded',
  loadFailedBody: 'Nothing has changed on-chain. This is a read failure, and retrying is safe.',
  retry: 'Try again',
} as const

export type OfferClockKind = 'accept' | 'pay' | 'confirm' | 'window'

/**
 * What the countdown block is counting, or null when there is nothing to count.
 *
 * The comp draws one clock — the payment window — because it draws one state.
 * A real offer moves through three, and each has its OWN deadline, so a single
 * hardcoded window would be showing the wrong number on two of them. When an
 * open offer has no closing deadline at all there is no clock to run, but the
 * window is still the fact the reader is deciding on, so it is stated
 * statically rather than dropped.
 */
export interface OfferClock {
  kind: OfferClockKind
  label: string
  note: string
  /** Live when present; `null` means `staticValue` is the whole answer. */
  deadline: Date | null
  staticValue: string | null
}

/**
 * Every clock belongs to somebody, and it is not always the reader.
 *
 * The block is rendered to BOTH parties, so one wording is wrong for one of
 * them on every live status: a seller was shown "Pay within — miss this and
 * the trade cancels itself" (an instruction to pay, given to the person being
 * paid) and "you can claim the crypto out of escrow yourself" (the buyer's
 * remedy against a silent seller, offered to that seller). Same defect the
 * order-of-events list had.
 */
const CLOCK_COPY: Record<OfferClockKind, Record<OfferPerspective, { label: string; note: string }>> = {
  accept: {
    buyer: {
      label: 'Offer closes in',
      note: 'After this the offer expires and the crypto returns to the seller.',
    },
    seller: {
      label: 'Your offer closes in',
      note: 'After this it expires and the crypto returns to your wallet.',
    },
  },
  pay: {
    buyer: {
      label: 'Pay within',
      note: 'Miss this and the trade cancels itself. Nothing is charged.',
    },
    seller: {
      label: 'The buyer pays within',
      note: 'If they miss it the trade cancels itself and your crypto comes back.',
    },
  },
  confirm: {
    buyer: {
      label: 'Seller confirms within',
      note: 'If they do not, you can claim the crypto out of escrow yourself.',
    },
    seller: {
      label: 'You confirm within',
      note: 'If you do not, the buyer can claim the crypto out of escrow themselves.',
    },
  },
  window: {
    buyer: {
      label: 'Payment window',
      note: 'How long you get to pay, once you accept. The clock starts then, not now.',
    },
    seller: {
      label: 'Payment window',
      note: 'How long the buyer gets to pay, once someone accepts. The clock starts then.',
    },
  },
}

/** Statuses that still have a clock worth showing. */
const LIVE_STATUSES: readonly EscrowStatus[] = ['open', 'accepted', 'submitted']

export function offerClockFor(
  offer: Pick<
    ExchangeDetail,
    'status' | 'accept_deadline' | 'completion_deadline' | 'approval_deadline' | 'payment_window_seconds'
  >,
  perspective: OfferPerspective,
): OfferClock | null {
  if (!LIVE_STATUSES.includes(offer.status)) return null

  const deadline = computeRelevantDeadline(offer)
  if (deadline === null) {
    // Only reachable while open: an accepted or submitted escrow always
    // carries the deadline its transition stamped.
    if (offer.status !== 'open') return null
    return {
      kind: 'window',
      ...CLOCK_COPY.window[perspective],
      deadline: null,
      staticValue: formatDurationShort(offer.payment_window_seconds),
    }
  }

  const kind: OfferClockKind =
    offer.status === 'open' ? 'accept' : offer.status === 'accepted' ? 'pay' : 'confirm'
  return { kind, ...CLOCK_COPY[kind][perspective], deadline, staticValue: null }
}

/**
 * How a trade names itself in a chat thread.
 *
 * The wording matches what the SERVER stamps on a message's escrow context
 * (`'Trade: ' || fiat_amount || ' ' || fiat_currency` in the conversations
 * route), so a thread opened from this page and one opened from the inbox
 * carry the same divider rather than two spellings of the same trade.
 */
export function exchangeChatContext(
  offer: Pick<ExchangeDetail, 'escrow_id' | 'fiat_amount' | 'fiat_currency'>,
): EscrowChatContext {
  return {
    id: offer.escrow_id,
    title: `Trade: ${offer.fiat_amount} ${offer.fiat_currency}`,
    kind: 'exchange',
  }
}
