'use client'

/**
 * One fiat intent's status (Tier-3 comp, lines 779-817) — the page a cash-out
 * lands on, and the page it is safe to come back to: the instruction persists
 * on the intent, so a reload resumes rather than restarts.
 *
 * A GONE intent and a failed READ are different answers and are drawn
 * differently. An outage keeps the last known intent on screen (see
 * `useFiatIntent`) rather than blanking a page that was showing someone their
 * money.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { isCancellable } from '@tenda/shared'
import { useParams } from 'next/navigation'
import { useFiatIntent } from '@/hooks/fiat/useFiatIntent'
import { INTENT_COPY, IntentRows, IntentStatusPanel } from '@/components/wallet/intent'
import { AlertPanel, ALERT_ACTION_CLASS } from '@/components/ui/AlertPanel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'

export default function FiatIntentPage() {
  const { id } = useParams<{ id: string }>()
  const { intent, gone, loading, cancelling, cancel } = useFiatIntent(id)
  const [confirming, setConfirming] = useState(false)

  if (loading && intent === null && !gone) {
    return (
      <div className="flex h-full items-center justify-center py-24" aria-busy="true">
        <Spinner />
        <span className="sr-only">{INTENT_COPY.loadingLabel}</span>
      </div>
    )
  }

  if (gone || intent === null) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-8 py-10">
        <AlertPanel
          title={INTENT_COPY.goneTitle}
          body={INTENT_COPY.goneBody}
          action={
            <Link href="/wallet" className={ALERT_ACTION_CLASS}>
              {INTENT_COPY.back}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-20 pt-8">
      <Link
        href="/wallet"
        className="inline-flex items-center gap-2 type-body-small font-semibold text-content-tertiary hover:text-content-primary hover:no-underline"
      >
        <ChevronLeft size={16} aria-hidden />
        {INTENT_COPY.back}
      </Link>

      <h1 className="mt-6 type-h2 text-content-primary">
        {INTENT_COPY.heading(intent.direction)}
      </h1>

      <IntentStatusPanel intent={intent} />

      {/* No KYC block, deliberately. `kyc_required`/`kyc_url` are on the wire,
          but the only provider that can set them is the licensed HTTP adapter
          (Yellow Card / Onramp.money), which stays absent from the registry
          until its merchant credentials exist — every key is commented out in
          .env, so routing falls through to `p2p_internal`, which hardcodes
          `kyc_required: false`. Building the panel now would mean testing
          against a value no live producer emits, against a wire mapping
          `licensed-http.ts` says is only "confirmed at onboarding". Whoever
          onboards a provider should build it then, against the real contract. */}

      <IntentRows intent={intent} />

      <div className="mt-8">
        {isCancellable(intent.status) ? (
          <Button variant="danger-outline" disabled={cancelling} onClick={() => setConfirming(true)}>
            {INTENT_COPY.cancel}
          </Button>
        ) : (
          <Link href="/wallet">
            <Button variant="outline">{INTENT_COPY.done}</Button>
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={INTENT_COPY.cancelConfirmTitle}
        message={INTENT_COPY.cancelConfirmBody}
        confirmLabel={INTENT_COPY.cancelConfirmLabel}
        destructive
        busy={cancelling}
        onConfirm={() => {
          setConfirming(false)
          void cancel()
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
