'use client'

/**
 * The escrow-context pill between message groups — web twin of mobile's
 * ChatContextDivider. Gig pills link to the public gig detail; exchange
 * pills render unlinked until the /exchange route exists (S6.4) — a pill
 * that 404s is worse than one that only informs.
 */
import Link from 'next/link'
import { Briefcase, ArrowLeftRight } from 'lucide-react'

interface Props {
  escrowId?: string | null
  escrowTitle?: string | null
  /** Routes the pill to the right detail surface; null = unknown → gig. */
  kind?: 'gig' | 'exchange' | null
}

export function ChatContextDivider({ escrowId, escrowTitle, kind }: Props) {
  const isOffer = kind === 'exchange'
  const title = escrowTitle ?? (isOffer ? 'View offer' : 'View gig')
  const label = isOffer ? 'TRADE' : 'GIG'
  const Icon = isOffer ? ArrowLeftRight : Briefcase

  if (!escrowId) {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="flex h-8 items-center rounded-full bg-surface-inset px-3.5 font-numeric text-[10.5px] font-semibold tracking-wide text-content-secondary">
          DIRECT MESSAGE
        </span>
      </div>
    )
  }

  const pill = (
    <>
      <Icon size={11} className="text-brand-primary" />
      <span className="text-content-secondary">{label}</span>
      <span className="text-content-tertiary">·</span>
      <span className="min-w-0 truncate text-content-primary">{title}</span>
    </>
  )
  const pillClass =
    'flex h-8 max-w-[90%] items-center gap-2 rounded-full bg-surface-inset px-3.5 font-numeric text-[10.5px] font-semibold tracking-wide'

  return (
    <div className="my-2 flex justify-center px-4">
      {isOffer ? (
        <span className={pillClass}>{pill}</span>
      ) : (
        <Link
          href={`/gig/${escrowId}`}
          aria-label={`Open gig: ${title}`}
          className={`${pillClass} transition-opacity hover:opacity-70`}
        >
          {pill}
        </Link>
      )}
    </div>
  )
}
