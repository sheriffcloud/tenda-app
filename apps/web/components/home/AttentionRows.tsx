'use client'

/**
 * "Needs your attention" (#60): one ruled row per item `attentionItems`
 * derives — a tone dot, what to do, when it was posted (and until when
 * applications run), the escrow's status and amount. Renders nothing when
 * nothing is owed; a heading over an empty list would be a promise of work
 * that is not there.
 */
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatAssetAmount, formatDate } from '@tenda/shared'
import { EscrowStatusBadge } from '@/components/escrow/StatusBadge'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { cn } from '@/lib/cn'
import type { AttentionItem, AttentionTone } from './attention'
import { HOME_COPY } from './copy'

const DOT: Record<AttentionTone, string> = {
  warn: 'bg-feedback-warning-base',
  brand: 'bg-brand-primary',
  live: 'bg-feedback-success-base',
}

function amountOf(item: AttentionItem): string {
  return item.escrow.kind === 'gig'
    ? formatAssetAmount(item.escrow.gig.amount_raw, item.escrow.gig.asset)
    : formatAssetAmount(item.escrow.row.amount_raw, item.escrow.row.asset)
}

export function AttentionRows({ items }: { items: readonly AttentionItem[] }) {
  if (items.length === 0) return null
  return (
    <ul data-attention aria-label={HOME_COPY.attention.label} className="mt-6 border-t border-border-default">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="grid grid-cols-[8px_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-border-subtle px-1 py-[13px] hover:bg-surface-inset"
          >
            <span aria-hidden className={cn('size-2 rounded-full', DOT[item.tone])} />
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-[22px] text-content-primary">
                {item.title}
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 type-body-small text-content-tertiary">
                <span>
                  {HOME_COPY.attention.posted} <RelativeTime iso={item.postedAt} className="font-numeric" />
                </span>
                {item.acceptingUntil !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {HOME_COPY.attention.acceptingUntil}{' '}
                      <span className="font-numeric">{formatDate(item.acceptingUntil)}</span>
                    </span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>{item.hint}</span>
              </span>
            </span>
            {item.escrow.kind === 'gig' ? (
              <EscrowStatusBadge status={item.escrow.gig.status} kind="gig" />
            ) : (
              <EscrowStatusBadge status={item.escrow.row.status} kind="exchange" />
            )}
            <span className="whitespace-nowrap font-numeric text-xs leading-4 text-content-primary">{amountOf(item)}</span>
            <ArrowRight size={14} aria-hidden className="text-content-tertiary" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
