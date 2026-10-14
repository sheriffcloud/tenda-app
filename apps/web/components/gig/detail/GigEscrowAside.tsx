/**
 * The sticky right column (comp lines 657-681): the money, the way in, and
 * the two sentences that explain why either can be trusted.
 *
 * `amount_raw` is the gross funded amount. The worker projection comes from
 * the deployment's live fee configuration and the fee tier baked into the
 * escrow, matching mobile and the settlement contract.
 *
 * The action slot holds `GigDetailApp`, which renders the sign-in CTA for an
 * anonymous reader and swaps in the party-scoped surface once a bearer
 * refetch lands. Only the explicit public allowlist crosses into it — client
 * component props are SERIALISED into the anonymous HTML.
 */
import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { chainLabel, splitAssetAmount, type GigDetail } from '@tenda/shared'
import { Eyebrow } from '@/components/ui'
import { GigDetailApp } from './GigDetailApp'
import { GigFeeNote } from './GigFeeNote'
import { GigSettlementSteps } from './GigSettlementSteps'
import { GIG_DETAIL_COPY } from './copy'

export function GigEscrowAside({ gig, actions }: { gig: GigDetail; actions?: ReactNode }) {
  const { amount, symbol } = splitAssetAmount(gig.amount_raw, gig.asset)

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
      {/* The money card is one of the two receipt-style objects on the page,
          so it keeps its shadow (#60 cards pass: the card shadow token only
          on the receipt-style objects). */}
      <div className="rounded-card border border-border-default bg-surface-card px-6 py-[22px] shadow-card">
        <Eyebrow tone="secondary">{GIG_DETAIL_COPY.locked}</Eyebrow>
        <div className="mt-2.5 flex items-end gap-2">
          <span className="type-mono-large text-utility-money">
            {amount}
          </span>
          {/* See GigCard: the space is for textContent, not for layout. */}
          {' '}
          <span className="pb-1.5 font-numeric text-xs leading-4 text-content-tertiary">
            {symbol}
          </span>
        </div>
        <GigFeeNote isSeeker={gig.is_seeker} amountRaw={gig.amount_raw} asset={gig.asset} />

        <div className="my-5 h-px bg-border-subtle" />

        {actions === undefined ? (
          <GigDetailApp initial={{
            escrow_id: gig.escrow_id,
            status: gig.status,
            is_assigned: gig.is_assigned,
            requires_approval: gig.requires_approval,
            accept_deadline: gig.accept_deadline,
          }} />
        ) : actions}

        <div className="mt-5 flex items-start gap-2.5 border-t border-border-subtle pt-5">
          <ShieldCheck
            size={16}
            aria-hidden
            className="mt-0.5 shrink-0 text-feedback-success-base"
          />
          <p className="type-body-small text-content-secondary">
            {GIG_DETAIL_COPY.lockedOn(chainLabel(gig.chain_id))}
          </p>
        </div>
      </div>

      <GigSettlementSteps requiresApproval={gig.requires_approval} />
    </aside>
  )
}
