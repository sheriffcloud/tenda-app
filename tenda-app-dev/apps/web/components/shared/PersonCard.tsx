'use client'

/**
 * Compact identity card for a counterparty — web analogue of mobile's
 * PersonCard: avatar, name, rating, standing chip, and (for others) a
 * contextual message link carrying the same query contract as mobile.
 */
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { AGENT_BADGE_LABEL, formatFullName } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { StandingBadge } from '@/components/profile'
import { escrowChatHref, type EscrowChatContext } from '@/lib/chat-href'

export interface PersonCardUser {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  review_score?: string | null
  /** Solana Seeker-phone flag (device-derived) — rendered as a small tag. */
  is_seeker?: boolean
  /** An autonomous agent's account (#19) — badged so a human always knows. */
  is_agent?: boolean
}

export function PersonCard({
  user,
  label,
  currentUserId,
  context,
}: {
  user: PersonCardUser
  /** Role line ('Seller', 'Buyer', 'Posted by'…). */
  label: string
  currentUserId: string
  /** Escrow context for the message link (mobile PersonCard's contract). */
  context?: EscrowChatContext
}) {
  const name = formatFullName(user.first_name, user.last_name) || 'Anonymous'
  const isSelf = user.id === currentUserId
  const score = user.review_score ? Number(user.review_score).toFixed(1) : null

  const chatHref = escrowChatHref(user.id, context)

  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card p-4">
      <Link href={`/profile/${user.id}`} aria-label={`View ${name}'s profile`}>
        <Avatar name={name} src={user.avatar_url} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-content-tertiary">{label}</p>
        <Link
          href={`/profile/${user.id}`}
          className="block truncate text-sm font-semibold text-content-primary hover:underline"
        >
          {isSelf ? 'You' : name}
          {score !== null && <span className="ml-1.5 font-numeric text-xs text-content-secondary">★ {score}</span>}
          {user.is_seeker === true && (
            <span className="ml-1.5 text-xs text-content-tertiary">· Seeker</span>
          )}
          {user.is_agent === true && (
            <span className="ml-1.5 text-xs font-semibold text-brand-primary">· {AGENT_BADGE_LABEL}</span>
          )}
        </Link>
        {/* Self included, like mobile: parties see their OWN public standing
            exactly where the counterparty sees it. */}
        <div className="mt-1">
          <StandingBadge userId={user.id} />
        </div>
      </div>
      {!isSelf && (
        <Link
          href={chatHref}
          aria-label={`Message ${name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-brand-primary transition-colors hover:bg-surface-inset"
        >
          <MessageCircle size={18} />
        </Link>
      )}
    </div>
  )
}
