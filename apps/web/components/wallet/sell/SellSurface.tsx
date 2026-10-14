'use client'

/**
 * Sell crypto (Tier-3 comp, lines 715-777): the two ways to turn crypto into
 * fiat, side by side with where the money lands.
 *
 * The comp's `data-two` is form | aside. The aside is SHARED by both modes on
 * purpose — the payout account decides the currency for a market quote and for
 * an offer alike, so moving it inside a tab would ask the same question twice
 * and let the two answers disagree.
 *
 * Mode lives in the URL: `?mode=offer` deep-links the second tab, and the two
 * are places a reader can link to, so they are LINKS with `aria-current` —
 * the same rule the exchange surface's tabs follow.
 */
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { EmptyPanel, EMPTY_ACTION_CLASS } from '@/components/ui/EmptyPanel'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'
import { usePayoutAccounts } from '@/hooks/fiat/usePayoutAccounts'
import { useAssetSelection } from '@/hooks/wallet/useAssetSelection'
import { InstantSellPanel } from './InstantSellPanel'
import { OfferSellPanel } from './OfferSellPanel'
import { PayoutAccountAside } from './PayoutAccountAside'
import { SELL_COPY, SELL_MODES, sellHref, type SellMode } from './copy'

export function SellSurface({ mode }: { mode: SellMode }) {
  const selection = useAssetSelection()
  const payout = usePayoutAccounts()
  // The amount is owned HERE so switching tabs keeps what was typed — the two
  // modes sell the same thing, and re-typing it is a tax on changing your mind.
  const [amount, setAmount] = useState('')

  const noWallet = selection.options.length === 0

  return (
    <div className="mx-auto w-full max-w-[1080px] px-8 pb-20 pt-8">
      <Link
        href="/wallet"
        className="inline-flex items-center gap-2 type-body-small font-semibold text-content-tertiary hover:text-content-primary hover:no-underline"
      >
        <ChevronLeft size={16} aria-hidden />
        {SELL_COPY.back}
      </Link>

      <div className="mt-6">
        <Eyebrow>{SELL_COPY.eyebrow}</Eyebrow>
        <h1 className="mt-2 type-h1 text-content-primary">
          {SELL_COPY.title}
        </h1>
      </div>

      <div
        className="mt-5 flex gap-1.5 border-b border-border-default pb-5"
        role="group"
        aria-label={SELL_COPY.modeGroupLabel}
      >
        {SELL_MODES.map((m) => {
          const current = m.key === mode
          return (
            <Link
              key={m.key}
              href={sellHref(m.key)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'rounded-control border px-3 py-2 text-sm font-semibold transition-colors duration-(--motion-fast) ease-(--motion-ease-standard) hover:no-underline',
                current
                  ? 'border-control-selected-border bg-control-selected-background text-brand-primary'
                  : 'border-border-default text-content-secondary hover:border-border-strong hover:text-content-primary',
              )}
            >
              {m.label}
            </Link>
          )
        })}
      </div>

      <p className="mt-4 max-w-[64ch] type-body text-content-secondary">
        {SELL_COPY.lede(mode)}
      </p>

      {noWallet ? (
        <div className="mt-6">
          <EmptyPanel
            icon={<ArrowLeftRight size={28} />}
            title={SELL_COPY.noWallet}
            body="Selling signs a transaction from your own wallet — nothing here is custodial."
            action={
              <Link href="/settings/linked-wallets" className={EMPTY_ACTION_CLASS}>
                {SELL_COPY.noWalletAction}
              </Link>
            }
          />
        </div>
      ) : (
        <div
          data-two
          className="mt-6 grid items-start gap-10 min-[1064px]:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="min-w-0">
            {mode === 'offer' ? (
              <OfferSellPanel
                selection={selection}
                payout={payout}
                amount={amount}
                onAmountChange={setAmount}
              />
            ) : (
              <InstantSellPanel
                selection={selection}
                payout={payout}
                amount={amount}
                onAmountChange={setAmount}
              />
            )}
          </div>
          <PayoutAccountAside payout={payout} />
        </div>
      )}
    </div>
  )
}
