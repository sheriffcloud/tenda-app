'use client'

/**
 * Compact, always-visible context card atop the mediation thread — web
 * twin of mobile's DisputeContextHeader: subject + amount + kind-aware
 * status, both parties (shared role vocabulary, raiser flagged, self reads
 * "You"), and the expandable dispute reason.
 */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  partyRoleLabel,
  partyAccent,
  displayName,
  formatAssetAmount,
  type DisputeThreadContext,
  type DossierParty,
} from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { EscrowStatusBadge } from '@/components/escrow/StatusBadge'
import { ACCENT_CLASSES } from './party-visual'
import { cn } from '@/lib/cn'

export function DisputeContextHeader({
  context,
  currentUserId,
}: {
  context: DisputeThreadContext
  /** So the current user's own party row reads "You". */
  currentUserId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const subject = context.subject_title ?? (context.kind === 'gig' ? 'Gig' : 'Currency exchange')

  return (
    <section className="mx-4 mt-2 flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-inset p-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate type-body font-semibold text-content-primary">{subject}</p>
        <EscrowStatusBadge status={context.status} kind={context.kind} />
      </div>

      <p className="font-numeric text-xs text-content-secondary">
        {formatAssetAmount(context.amount_raw, context.asset)}
      </p>

      <div className="mt-1 flex gap-4">
        {context.parties.map((party) => (
          <PartyChip
            key={party.user_id}
            party={party}
            kind={context.kind}
            isSelf={party.user_id === currentUserId}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse dispute reason' : 'Expand dispute reason'}
        className="mt-1 text-left"
      >
        <p className={cn('text-xs leading-[18px] text-content-secondary', !expanded && 'line-clamp-2')}>
          <span className="font-semibold text-content-tertiary">Reason: </span>
          {context.reason}
        </p>
      </button>
    </section>
  )
}

function PartyChip({
  party,
  kind,
  isSelf,
}: {
  party: DossierParty
  kind: DisputeThreadContext['kind']
  isSelf: boolean
}) {
  const name = isSelf ? 'You' : displayName(party.first_name, party.last_name, party.user_id)
  const accent = ACCENT_CLASSES[partyAccent(party.role)]

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {/* The role colour rides the avatar ring — same accent the thread
          stripes this party's bubbles with. */}
      <Avatar size="sm" name={name} className={cn('rounded-full ring-2', accent.ring)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-content-tertiary">{partyRoleLabel(kind, party.role)}</p>
        <p className="flex items-center gap-1">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-content-primary">{name}</span>
          {party.raised_dispute && (
            <AlertTriangle size={12} className="shrink-0 text-feedback-danger-base" aria-label="Raised the dispute" />
          )}
        </p>
      </div>
    </div>
  )
}
