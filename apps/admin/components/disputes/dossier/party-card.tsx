import Link from 'next/link'
import { partyRoleLabel, displayName, type DossierParty, type EscrowKind } from '@tenda/shared'
import { Badge } from '@/components/ui/badge'

/**
 * One party to the disputed escrow. Shows the kind-aware role (Poster /
 * Worker for gigs, Maker / Taker for exchanges), the name, a "raised the
 * dispute" marker, and a link into the user detail surface.
 */
export function PartyCard({ party, kind }: { party: DossierParty; kind: EscrowKind }) {
  const name = displayName(party.first_name, party.last_name, party.user_id)
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{partyRoleLabel(kind, party.role)}</span>
          {party.raised_dispute && (
            <Badge variant="destructive" className="text-[10px]">
              raised dispute
            </Badge>
          )}
        </div>
        <Link
          href={`/users/${party.user_id}`}
          className="block truncate text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {name}
        </Link>
      </div>
    </div>
  )
}
