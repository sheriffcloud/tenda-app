'use client'

/**
 * /wallet (Tier-3 comp, lines 647-713): what you hold, what you can do with
 * it, and everything that has moved.
 *
 * The section switch is shared's `resolveWalletSection` and it is the whole
 * point of this component: a load FAILURE is never rendered as "no wallet
 * linked", and an unusable chain registry is never rendered as a real `0.00`.
 * Those were mobile's two wallet-screen bugs and they are pinned by the
 * resolver's own tests — this file must keep asking it rather than deciding.
 */
import Link from 'next/link'
import { RotateCw, Wallet } from 'lucide-react'
import { useWalletScreen } from '@/hooks/wallet/useWalletScreen'
import { AlertPanel, ALERT_ACTION_CLASS } from '@/components/ui/AlertPanel'
import { Button } from '@/components/ui'
import { EmptyPanel, EMPTY_ACTION_CLASS } from '@/components/ui/EmptyPanel'
import { WalletActions } from './WalletActions'
import { WalletBalanceGrid } from './WalletBalanceGrid'
import { GasClaimNotice } from './GasClaimNotice'
import { WalletHeroCard } from './WalletHeroCard'
import { TxFeed } from './TxFeed'
import { WALLET_COPY } from './copy'

export function WalletScreen() {
  const screen = useWalletScreen()

  return (
    <div className="mx-auto w-full max-w-[1080px] px-8 pb-20 pt-8">
      <div className="mb-7 flex flex-wrap items-center gap-4">
        {/* No eyebrow: on the surfaces that have one it names the SECTION above
            a different title. Here they would both read "Wallet". */}
        <div className="min-w-[260px] flex-1">
          <h1 className="type-h1 text-content-primary">
            {WALLET_COPY.title}
          </h1>
        </div>
        <Button
          variant="outline"
          disabled={screen.refreshing}
          onClick={() => void screen.handleRefresh()}
        >
          <RotateCw size={15} aria-hidden />
          {screen.refreshing ? WALLET_COPY.refreshing : WALLET_COPY.refresh}
        </Button>
      </div>

      {screen.section === 'no-wallet' && (
        <EmptyPanel
          icon={<Wallet size={28} />}
          title={WALLET_COPY.noWalletTitle}
          body={WALLET_COPY.noWalletBody}
          action={
            <Link href="/settings/linked-wallets" className={EMPTY_ACTION_CLASS}>
              {WALLET_COPY.noWalletAction}
            </Link>
          }
        />
      )}

      {screen.section === 'wallets-error' && (
        <AlertPanel
          title={WALLET_COPY.walletsErrorTitle}
          body={WALLET_COPY.walletsErrorBody}
          action={
            <button
              type="button"
              onClick={() => void screen.retryWallets()}
              className={ALERT_ACTION_CLASS}
            >
              {WALLET_COPY.retry}
            </button>
          }
        />
      )}

      {screen.section === 'balances-unavailable' && (
        <AlertPanel
          title={WALLET_COPY.balancesErrorTitle}
          body={WALLET_COPY.balancesErrorBody}
          action={
            <button
              type="button"
              onClick={() => void screen.retryChains()}
              className={ALERT_ACTION_CLASS}
            >
              {WALLET_COPY.retry}
            </button>
          }
        />
      )}

      {(screen.section === 'ready' || screen.section === 'loading') && (
        <div className="flex flex-col gap-6">
          <WalletHeroCard
            totalUsdc={screen.totalUsdc}
            earnedUsdc={screen.earnedUsdc}
            spentUsdc={screen.spentUsdc}
            isLoading={screen.section === 'loading' || screen.isLoading}
          />
          {screen.section === 'ready' && <WalletBalanceGrid balances={screen.balances} />}
          {/* The gas grant exists and is claimed in the app (#53c-2). Under the
              balances, where a reader has just seen how little gas they hold. */}
          <GasClaimNotice />
          <WalletActions />
        </div>
      )}

      {screen.user !== null && (
        <TxFeed
          feed={screen.feed}
          userId={screen.user.id}
          total={screen.totalTransactions}
          isLoading={screen.isLoadingTransactions}
          hasMore={screen.hasMoreTransactions}
          isLoadingMore={screen.isLoadingMoreTransactions}
          onLoadMore={() => void screen.loadMoreTransactions()}
        />
      )}
    </div>
  )
}
