'use client'

/**
 * The exchange surface: the control row, whichever of the two lists is
 * selected, and the states each can be in (Tier-3 comp, lines 397-517).
 *
 * The page owns nothing but composition (#50 removed its last gate);
 * everything the reader sees is here, so the states can be rendered in a
 * test without a router or a session.
 */
import Link from 'next/link'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import { EmptyPanel } from '@/components/ui/EmptyPanel'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PaginatedList } from '@/components/shared/PaginatedList'
import type { ExchangeScreenState } from '@/hooks/exchange/useExchangeScreen'
import { ExchangeFilters } from './ExchangeFilters'
import { MyTradeCard } from './MyTradeCard'
import { OfferCard } from './OfferCard'
import { OfferCardSkeleton } from './OfferCardSkeleton'
import { EXCHANGE_COPY, type ExchangeRouteState } from './copy'
import { sellHref } from '@/components/wallet/sell/copy'

export function ExchangeSurface({
  route,
  screen,
  userId,
}: {
  route: ExchangeRouteState
  screen: ExchangeScreenState
  userId: string
}) {
  const { market, myTrades } = screen
  const isMarket = route.tab === 'market'
  const list = isMarket ? market : myTrades
  const filtered = route.currency !== null || route.chainId !== null

  return (
    <div className="mx-auto w-full max-w-[1080px] px-8 pb-20 pt-8">
      <div className="mb-7 flex flex-wrap items-center gap-4">
        <div className="min-w-[260px] flex-1">
          <Eyebrow>{EXCHANGE_COPY.eyebrow}</Eyebrow>
          <h1 className="mt-2 type-h1 text-content-primary">
            {EXCHANGE_COPY.title(route.tab)}
          </h1>
        </div>
        {/* Mobile's exchange "+" deep-links the sell surface's offer tab —
            one composer for offers, never a second (spec-correction #50).
            buttonVariants on the anchor, per Button's own contract: a real
            <button> inside a link is invalid interactive nesting. */}
        <Link href={sellHref('offer')} className={buttonVariants({ variant: 'outline' })}>
          <Plus size={15} aria-hidden /> {EXCHANGE_COPY.postOffer}
        </Link>
      </div>

      <ExchangeFilters
        route={route}
        countLabel={
          list.hasFetched
            ? isMarket
              ? EXCHANGE_COPY.count(market.total, route.currency)
              : EXCHANGE_COPY.myTradesCount(myTrades.total)
            : undefined
        }
      />

      <div className="mt-5">
        {isMarket ? (
          <PaginatedList
            list={market}
            keyOf={(offer) => offer.escrow_id}
            renderItem={(offer) => <OfferCard offer={offer} />}
            listLabel={EXCHANGE_COPY.market.label}
            skeleton={<OfferCardSkeleton />}
            errorTitle={EXCHANGE_COPY.market.errorTitle}
            errorBody={EXCHANGE_COPY.market.errorBody}
            empty={
              <EmptyPanel
                icon={<ArrowLeftRight size={28} />}
                title={EXCHANGE_COPY.market.emptyTitle(filtered)}
                // A filter narrowing a real book to nothing is not an empty
                // book, and telling the reader to "check back shortly" when
                // clearing one chip would show them offers is simply wrong.
                body={
                  filtered
                    ? EXCHANGE_COPY.market.emptyBody(route.currency, route.chainId)
                    : EXCHANGE_COPY.market.emptyUnfilteredBody
                }
              />
            }
          />
        ) : (
          <PaginatedList
            list={myTrades}
            keyOf={(row) => row.id}
            renderItem={(row) => <MyTradeCard row={row} userId={userId} />}
            listLabel={EXCHANGE_COPY.mine.label}
            skeleton={<OfferCardSkeleton rows={3} />}
            errorTitle={EXCHANGE_COPY.mine.errorTitle}
            errorBody={EXCHANGE_COPY.mine.errorBody}
            empty={
              <EmptyPanel
                icon={<ArrowLeftRight size={28} />}
                // The CHAIN alone, not `filtered`: the currency chip is not
                // even rendered on this tab and cannot narrow this list.
                title={EXCHANGE_COPY.mine.emptyTitle(route.chainId !== null)}
                body={EXCHANGE_COPY.mine.emptyBody(route.chainId !== null)}
              />
            }
          />
        )}

        {isMarket && market.items.length > 0 && (
          <p className="mt-5 max-w-[70ch] type-body-small text-content-tertiary">
            {EXCHANGE_COPY.ordering}
          </p>
        )}
      </div>
    </div>
  )
}
