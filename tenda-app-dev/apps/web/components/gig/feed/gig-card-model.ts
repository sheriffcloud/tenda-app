import { splitAssetAmount, type GigSummary } from '@tenda/shared'

export type GigCardModel = Pick<
  GigSummary,
  | 'escrow_id'
  | 'public_feed_revision'
  | 'accept_deadline'
  | 'created_at'
  | 'chain_id'
  | 'title'
  | 'category'
  | 'country'
  | 'city'
  | 'remote'
  | 'requires_approval'
  | 'creator'
> & {
  displayAmount: string
  displaySymbol: string
}

/** Keep blockchain base units out of the public page's HTML/RSC payload. */
export function toGigCardModel(gig: GigSummary): GigCardModel {
  const { amount, symbol } = splitAssetAmount(gig.amount_raw, gig.asset)
  return {
    escrow_id: gig.escrow_id,
    public_feed_revision: gig.public_feed_revision,
    accept_deadline: gig.accept_deadline,
    created_at: gig.created_at,
    chain_id: gig.chain_id,
    title: gig.title,
    category: gig.category,
    country: gig.country,
    city: gig.city,
    remote: gig.remote,
    requires_approval: gig.requires_approval,
    creator: gig.creator,
    displayAmount: amount,
    displaySymbol: symbol,
  }
}
