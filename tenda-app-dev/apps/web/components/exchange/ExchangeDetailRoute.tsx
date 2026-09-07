'use client'

import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useExchangeDetail } from '@/hooks/exchange/useExchangeDetail'
import { ExchangeDetailApp } from '@/components/exchange'
import { OFFER_DETAIL_COPY } from '@/components/exchange/detail'
import { EXCHANGE_COPY } from '@/components/exchange/market'
import { ALERT_ACTION_CLASS, AlertPanel } from '@/components/ui/AlertPanel'
import { Spinner } from '@/components/ui/Spinner'

export function ExchangeDetailRoute({ id }: { id: string }) {
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const { offer, isLoading, error, refresh } = useExchangeDetail(id)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  if (offer === null || userId === null) {
    const gone = error?.gone === true
    return (
      <div className="mx-auto w-full max-w-[720px] px-8 py-10">
        <AlertPanel
          title={gone ? OFFER_DETAIL_COPY.unavailableTitle : OFFER_DETAIL_COPY.loadFailedTitle}
          body={gone ? OFFER_DETAIL_COPY.unavailableBody : OFFER_DETAIL_COPY.loadFailedBody}
          action={
            gone ? (
              <Link href="/exchange" className={ALERT_ACTION_CLASS}>
                {OFFER_DETAIL_COPY.back}
              </Link>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => void refresh()} className={ALERT_ACTION_CLASS}>
                  <RotateCw size={16} aria-hidden />
                  {OFFER_DETAIL_COPY.retry}
                </button>
                <Link
                  href="/exchange"
                  className="mt-5 text-sm font-semibold text-feedback-danger-text underline"
                >
                  {EXCHANGE_COPY.market.label}
                </Link>
              </div>
            )
          }
        />
      </div>
    )
  }

  return <ExchangeDetailApp offer={offer} userId={userId} refresh={refresh} />
}
