import { Badge } from '@/components/ui/Badge'
import type { EscrowStatus } from '@tenda/shared'

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent' | 'neutral'

// Exchange-flavoured labels over the v2 escrow statuses: 'submitted' is the
// buyer's fiat-payment proof awaiting seller confirmation.
const VARIANT: Record<EscrowStatus, BadgeTone> = {
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

const LABEL: Record<EscrowStatus, string> = {
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

interface Props {
  status: EscrowStatus
}

export function ExchangeStatusBadge({ status }: Props) {
  return <Badge variant={VARIANT[status]} label={LABEL[status]} />
}
