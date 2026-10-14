/**
 * Kind-aware escrow status badges — web twins of mobile's GigStatusBadge /
 * ExchangeStatusBadge, both reading the SHARED vocabulary (labels + badge
 * variants live in @tenda/shared, never per-client tables).
 */
import {
  EXCHANGE_STATUS_BADGE_VARIANT,
  EXCHANGE_STATUS_LABEL,
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  type EscrowStatus,
} from '@tenda/shared'
import { Badge } from '@/components/ui/Badge'

export function GigStatusBadge({ status }: { status: EscrowStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANT[status]} label={STATUS_LABEL[status]} />
}

export function ExchangeStatusBadge({ status }: { status: EscrowStatus }) {
  return (
    <Badge variant={EXCHANGE_STATUS_BADGE_VARIANT[status]} label={EXCHANGE_STATUS_LABEL[status]} />
  )
}

export function EscrowStatusBadge({ status, kind }: { status: EscrowStatus; kind: 'gig' | 'exchange' }) {
  return kind === 'gig' ? <GigStatusBadge status={status} /> : <ExchangeStatusBadge status={status} />
}
