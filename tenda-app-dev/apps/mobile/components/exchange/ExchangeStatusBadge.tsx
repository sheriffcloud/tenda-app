import { Badge } from '@/components/ui/Badge'
import { EXCHANGE_STATUS_BADGE_VARIANT, EXCHANGE_STATUS_LABEL } from '@tenda/shared'
import type { EscrowStatus } from '@tenda/shared'

interface Props {
  status: EscrowStatus
}

/** Exchange-flavoured labels over v2 escrow statuses (vocabulary in shared). */
export function ExchangeStatusBadge({ status }: Props) {
  return <Badge variant={EXCHANGE_STATUS_BADGE_VARIANT[status]} label={EXCHANGE_STATUS_LABEL[status]} />
}
