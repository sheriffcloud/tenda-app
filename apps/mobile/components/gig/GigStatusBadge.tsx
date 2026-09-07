import { Badge } from '@/components/ui/Badge'
import { STATUS_BADGE_VARIANT, STATUS_LABEL } from '@/lib/gig-display'
import type { EscrowStatus } from '@tenda/shared'

interface GigStatusBadgeProps {
  status: EscrowStatus
}

export function GigStatusBadge({ status }: GigStatusBadgeProps) {
  return (
    <Badge
      variant={STATUS_BADGE_VARIANT[status]}
      label={STATUS_LABEL[status]}
    />
  )
}
