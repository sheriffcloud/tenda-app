import { useState, useEffect } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Header } from '@/components/ui'
import { RestrictionBanner } from '@/components/reputation'
import { showToast } from '@/components/ui/Toast'
import { GigForm } from '@/components/gig/GigForm'
import { NudgeSheet } from '@/components/onboarding/NudgeSheet'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'
import { TransactionMonitor } from '@/components/feedback'
import { TxConfirmDialog } from '@/components/escrow'
import { TX_PROGRESS_LABEL } from '@tenda/shared'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { api } from '@/api/client'
import { coerceCityForCountry, DEFAULT_COMPLETION_SECONDS, formatAssetAmount, type GigFormValues } from '@tenda/shared'
import { useGigFunding } from '@/hooks/useGigFunding'
import { ModerationBlockedDialog } from '@/components/moderation/ModerationBlockedDialog'


export default function PostGigScreen() {
  const params = useLocalSearchParams<{ draftId?: string }>()
  // Tab screens retain params across visits, '' (cleared) reads as absent.
  const draftId = params.draftId !== undefined && params.draftId !== '' ? params.draftId : undefined
  const [showNudge, setShowNudge] = useState(false)
  // CO6 "retry from draft": prefill from an abandoned draft, then recreate
  // fresh and discard the old row (the unsigned create tx is bound to the
  // old escrow id, so in-place editing is impossible by design).
  const [draftValues, setDraftValues] = useState<Partial<GigFormValues> | null>(null)
  const [draftLoading, setDraftLoading] = useState(draftId !== undefined)
  // Bumped when a composed gig has been committed to the server. This is a tab
  // screen, so it never unmounts and GigForm would otherwise keep the posted
  // gig's values forever; the bump forces a fresh, blank form.
  const [composerGeneration, setComposerGeneration] = useState(0)
  const { dismissedNudges } = useOnboardingStore()

  const funding = useGigFunding({
    draftId,
    resetForm: () => {
      setDraftValues(null)
      setComposerGeneration((n) => n + 1)
    },
  })

  useEffect(() => {
    if (!dismissedNudges.post) setShowNudge(true)
  }, [dismissedNudges.post])

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
  // async only to satisfy GigForm's Promise<void> onSubmit contract.
  async function handleFormSubmit(values: GigFormValues) {
    if (!values.category) return
    const safeCity = coerceCityForCountry(values.country, values.city)
    if (!values.remote && (!values.country || !safeCity)) return
    funding.setPendingValues(values)
  }

  const { pendingValues } = funding

  return (
    <>
      <NudgeSheet
        visible={showNudge}
        nudgeKey="post"
        title="Posting your first gig"
        body="Your payment is locked upfront in escrow, workers only see confirmed gigs with guaranteed funds. You approve the work before anyone gets paid."
        guideRoute="/(support)/posting"
        onClose={() => setShowNudge(false)}
      />
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
        <Header title={draftId !== undefined ? 'Edit & repost' : 'Post a gig'} showBack />
        <RestrictionBanner />
        {draftLoading ? (
          <LoadingScreen />
        ) : (
          <GigForm
            // Remount when the prefill arrives (GigForm seeds its state once)
            // and when a posted gig retires the previous composer.
            key={`${draftValues !== null ? draftId : 'blank'}:${composerGeneration}`}
            initialValues={draftValues ?? undefined}
            submitLabel={draftId !== undefined ? 'Repost Gig' : 'Post Gig'}
            onSubmit={handleFormSubmit}
            isLoading={funding.phase !== 'idle'}
          />
        )}
      </ScreenContainer>

      <TxConfirmDialog
        action={pendingValues !== null ? 'create' : null}
        // No `boundSigner`: nothing is bound until this create lands, so the
        // row previews the free resolution — which is also what the create
        // declares, so the preview and the bake cannot disagree.
        chainId={pendingValues?.chainId}
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

      <ModerationBlockedDialog
        visible={funding.blockedMessage !== null}
        message={funding.blockedMessage ?? ''}
        onEdit={funding.dismissBlocked}
      />
    </>
  )
}
