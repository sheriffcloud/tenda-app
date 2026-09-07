'use client'

/**
 * Post a Gig — the five-step wizard (Post Wizard comp). The wizard only
 * validates + opens the confirm gate; the funding lifecycle (draft escrow →
 * gig details → sign → monitor) lives in useGigFunding. `?draftId=` prefills
 * from an abandoned draft (CO6 retry-from-draft: recreate fresh and discard
 * the old row — the unsigned create tx is bound to the old escrow id, so
 * in-place editing is impossible by design).
 */
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  TX_PROGRESS_LABEL,
  coerceCityForCountry,
  formatAssetAmount,
  DEFAULT_COMPLETION_SECONDS,
  type GigFormValues,
} from '@tenda/shared'
import { api } from '@/api/client'
import { showToast } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import { GigWizard } from '@/components/gig/GigWizard'
import { ModerationBlockedDialog } from '@/components/moderation/ModerationBlockedDialog'
import { TxConfirmDialog } from '@/components/escrow/TxConfirmDialog'
import { TransactionMonitor } from '@/components/escrow/TransactionMonitor'
import { useGigFunding } from '@/hooks/gig/useGigFunding'

function PostGigScreen() {
  const params = useSearchParams()
  const rawDraftId = params.get('draftId')
  const draftId = rawDraftId !== null && rawDraftId !== '' ? rawDraftId : undefined
  // CO6 "retry from draft": prefill from an abandoned draft, then recreate
  // fresh and discard the old row.
  const [draftValues, setDraftValues] = useState<Partial<GigFormValues> | null>(null)
  const [draftLoading, setDraftLoading] = useState(draftId !== undefined)
  // Bumped when a composed gig has been committed to the server, forcing a
  // fresh blank form (the wizard seeds its state once per mount key).
  const [composerGeneration, setComposerGeneration] = useState(0)

  const funding = useGigFunding({
    draftId,
    resetForm: () => {
      setDraftValues(null)
      setComposerGeneration((n) => n + 1)
    },
  })

  useEffect(() => {
    if (draftId === undefined) return
    let cancelled = false
    void (async () => {
      try {
        const draft = await api.gigs.get({ id: draftId })
        if (cancelled) return
        setDraftValues({
          title: draft.title,
          description: draft.description ?? '',
          chainId: draft.chain_id,
          asset: draft.asset,
          // Straight through as the base-unit string it already is. It was
          // Number()'d here, which is exactly the corruption #32 removes: a
          // resumed 18-decimal draft came back as an approximation of itself.
          paymentRaw: draft.amount_raw,
          completionDuration: draft.completion_duration_seconds ?? DEFAULT_COMPLETION_SECONDS,
          category: draft.category,
          country: draft.country,
          remote: draft.remote,
          city: draft.city,
          proofRequirements: draft.proof_requirements,
          latitude: draft.latitude,
          longitude: draft.longitude,
          proofParams: draft.proof_params,
          requiresApproval: draft.requires_approval,
        })
      } catch {
        if (!cancelled) showToast('info', 'Could not load the draft, starting fresh')
      } finally {
        if (!cancelled) setDraftLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draftId])

  // Form submit only validates + opens the confirm gate (the pre-sign step
  // that tells the user funding locks their money and the wallet will open).
  async function handleFormSubmit(values: GigFormValues) {
    if (!values.category) return
    const safeCity = coerceCityForCountry(values.country, values.city)
    if (!values.remote && (!values.country || !safeCity)) return
    funding.setPendingValues(values)
  }

  const { pendingValues } = funding

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8">
      {/* The wizard's step title is this page's h1, so the repost context is a
          notice rather than a second heading competing with it. */}
      {draftId !== undefined && !draftLoading && (
        <p className="mb-6 rounded-card border border-border-default bg-surface-inset px-4 py-3 text-sm text-content-secondary">
          Reposting an abandoned draft. It is recreated fresh and the old one is discarded — the
          unsigned transaction was bound to the draft&rsquo;s escrow, so it cannot be edited in
          place.
        </p>
      )}
      {draftLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <GigWizard
          // Remount when the prefill arrives (the wizard seeds its state once)
          // and when a posted gig retires the previous composer.
          key={`${draftValues !== null ? draftId : 'blank'}:${composerGeneration}`}
          initialValues={draftValues ?? undefined}
          onSubmit={handleFormSubmit}
          isLoading={funding.phase !== 'idle'}
        />
      )}

      <TxConfirmDialog
        action={pendingValues !== null ? 'create' : null}
        {...(pendingValues !== null
          ? {
              chainId: pendingValues.chainId,
              // Funding debits the full budget — the signer row warns if the
              // previewed wallet can't cover it, before the permit signature.
              spend: { assetId: pendingValues.asset, amountRaw: pendingValues.paymentRaw },
            }
          : {})}
        ctx={{
          amount:
            pendingValues !== null
              ? formatAssetAmount(pendingValues.paymentRaw, pendingValues.asset)
              : '',
          kind: 'gig',
        }}
        onConfirm={() => void funding.runFunding()}
        onCancel={() => funding.setPendingValues(null)}
      />

      {(funding.phase !== 'idle' || funding.monitor !== null) && (
        <TransactionMonitor
          signature={funding.monitor?.signature ?? null}
          phase={funding.phase}
          actionLabel={TX_PROGRESS_LABEL.create}
          preparingCaption="Reviewing your gig against our guidelines — this takes a few seconds before your wallet opens."
          escrowId={funding.monitor?.escrowId}
          chainId={funding.monitor?.chainId}
          checkApplied={() => funding.checkApplied()}
          onConfirmed={funding.handleFunded}
          onFailed={funding.handleFundTimeout}
        />
      )}

      <ModerationBlockedDialog
        open={funding.blockedMessage !== null}
        message={funding.blockedMessage ?? ''}
        onEdit={funding.dismissBlocked}
      />
    </div>
  )
}

export default function CreateGigPage() {
  // useSearchParams needs a Suspense boundary under the app router.
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
      <PostGigScreen />
    </Suspense>
  )
}
