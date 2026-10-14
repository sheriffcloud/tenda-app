/**
 * Exchange-flavoured display vocabulary over the v2 escrow statuses —
 * moved from apps/mobile/components/exchange/ExchangeStatusBadge.tsx (S6
 * anti-drift: web renders the same badges). 'submitted' is the buyer's
 * fiat-payment proof awaiting seller confirmation.
 */
import type { EscrowStatus } from '../../types/escrow'
import type { STATUS_BADGE_VARIANT } from '../gig-display'

type BadgeTone = (typeof STATUS_BADGE_VARIANT)[EscrowStatus]

export const EXCHANGE_STATUS_BADGE_VARIANT: Record<EscrowStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  accepted: 'brand',
  submitted: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'neutral',
  disputed: 'danger',
  resolved: 'neutral',
}

export const EXCHANGE_STATUS_LABEL: Record<EscrowStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  accepted: 'In progress',
  submitted: 'In payment',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  disputed: 'Disputed',
  resolved: 'Resolved',
}
