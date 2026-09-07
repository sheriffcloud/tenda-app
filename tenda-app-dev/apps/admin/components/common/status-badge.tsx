import { Badge } from '@/components/ui/badge'
import type { EscrowStatus, UserStatus } from '@tenda/shared'

/** v2 unified escrow badge (gigs + exchange share one status vocabulary). */
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  const variant =
    status === 'completed' || status === 'resolved' ? 'default' :
    status === 'disputed' || status === 'cancelled' || status === 'refunded' ? 'destructive' :
    'outline'
  return <Badge variant={variant} className="capitalize">{status}</Badge>
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant={status === 'active' ? 'default' : 'destructive'} className="capitalize">
      {status}
    </Badge>
  )
}
