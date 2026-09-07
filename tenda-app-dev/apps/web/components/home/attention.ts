/**
 * "Needs your attention" — MY escrows and trades only, each from a list the
 * dashboard already holds (#60). Pure: rows in, items out, so the rule is
 * testable without a render and the card only draws.
 *
 * Four situations, all real on the wire:
 *   - a gig I POSTED has a proof waiting on me        (posted, `submitted`)
 *   - a gig I am WORKING has my proof waiting on them (working, `submitted`)
 *   - a gig I posted is taking applications           (posted, `open`, approval mode)
 *   - a trade I ACCEPTED is waiting on my transfer     (exchange, `accepted`, I am the counterparty)
 *
 * Nothing here counts applicants, names a counterparty or counts down an
 * approval window: none of those is on the LIST wire (`GigSummary` carries
 * `created_at` and `accept_deadline`; the approval deadline is a detail-only
 * field — spec-correction #13's rule). The subtitles say what the rows carry.
 */
import type { EscrowListRow, GigSummary } from '@tenda/shared'
import { myGigHref } from '@/components/gig/my-gigs/copy'

export type AttentionTone = 'warn' | 'brand' | 'live'

export interface AttentionItem {
  key: string
  tone: AttentionTone
  href: string
  title: string
  hint: string
  /** The row's escrow, for the status badge and the amount. */
  escrow: { kind: 'gig'; gig: GigSummary } | { kind: 'exchange'; row: EscrowListRow }
  /** When the escrow was posted — the one instant every list row carries. */
  postedAt: string
  /** The date applications close, on the one item whose wire has it. */
  acceptingUntil: string | null
}

export interface AttentionCopy {
  approve: (title: string) => string
  approveHint: string
  awaiting: (title: string) => string
  awaitingHint: string
  applications: (title: string) => string
  applicationsHint: string
  trade: string
  tradeHint: string
}

export function attentionItems({
  posted,
  working,
  trades,
  userId,
  copy,
}: {
  posted: readonly GigSummary[]
  working: readonly GigSummary[]
  trades: readonly EscrowListRow[]
  userId: string
  copy: AttentionCopy
}): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const gig of posted) {
    if (gig.status === 'submitted') {
      items.push({
        key: `approve:${gig.escrow_id}`,
        tone: 'warn',
        href: myGigHref(gig.escrow_id, 'posted', null),
        title: copy.approve(gig.title),
        hint: copy.approveHint,
        escrow: { kind: 'gig', gig },
        postedAt: gig.created_at,
        acceptingUntil: null,
      })
    } else if (gig.status === 'open' && gig.requires_approval) {
      items.push({
        key: `applications:${gig.escrow_id}`,
        tone: 'brand',
        href: `${myGigHref(gig.escrow_id, 'posted', null)}/applicants`,
        title: copy.applications(gig.title),
        hint: copy.applicationsHint,
        escrow: { kind: 'gig', gig },
        postedAt: gig.created_at,
        acceptingUntil: gig.accept_deadline,
      })
    }
  }
  for (const gig of working) {
    if (gig.status !== 'submitted') continue
    items.push({
      key: `awaiting:${gig.escrow_id}`,
      tone: 'warn',
      href: myGigHref(gig.escrow_id, 'working', null),
      title: copy.awaiting(gig.title),
      hint: copy.awaitingHint,
      escrow: { kind: 'gig', gig },
      postedAt: gig.created_at,
      acceptingUntil: null,
    })
  }
  for (const row of trades) {
    // The counterparty of an exchange pays the fiat; `accepted` is the window
    // in which that transfer is owed.
    if (row.kind !== 'exchange' || row.status !== 'accepted' || row.counterparty_id !== userId) continue
    items.push({
      key: `trade:${row.id}`,
      tone: 'live',
      href: `/exchange/${row.id}`,
      title: copy.trade,
      hint: copy.tradeHint,
      escrow: { kind: 'exchange', row },
      postedAt: row.created_at,
      acceptingUntil: null,
    })
  }
  return items
}
