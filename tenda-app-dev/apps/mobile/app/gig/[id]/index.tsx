/**
 * Gig detail (cutover §6 rewrite): read surface over /v1/gigs/:id; every
 * transition rides the shared escrow action hook (sign → broadcast →
 * client-ping). The scroll body lives in GigDetailBody; CTA visibility in
 * GigCTABar; sheets in GigActionSheets.
 */
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, RefreshControl, Share } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Share2 } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { ScreenContainer, showToast, ConfirmDialog } from '@/components/ui'
import {
  GigDetailBody,
  GigCTABar,
  GigActionSheets,
  GigDetailGate,
  type ActiveSheet,
} from '@/components/gig'
import { ApplySheet, useGigApprovalFlow } from '@/components/gig/gig-applications'
import { partiesOf } from '@tenda/shared'
import { MediaViewerModal } from '@/components/shared/media/MediaViewerModal'
import type { MediaItem } from '@/components/shared/media/types'
import { DetailChrome, EscrowTransactionMonitor, TxConfirmDialog } from '@/components/escrow'
import { txSuccessCopy } from '@tenda/shared'
import { NudgeSheet } from '@/components/onboarding/NudgeSheet'
import { ReportSheet } from '@/components/moderation/ReportSheet'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { useGigsStore } from '@/stores'
import { apiConfig, canAccept, formatAssetAmount, formatDuration } from '@tenda/shared'
import { getEnv } from '@/lib/env'
import { api } from '@/api/client'
import { useEscrowActions, type EscrowProofInput } from '@/hooks/useEscrowActions'
import { useEscrowLiveRefresh } from '@/hooks/useEscrowLiveRefresh'
import { useEscrowFee } from '@/hooks/useEscrowFee'
import type { EscrowTxType, GigDetail } from '@tenda/shared'

function GigDetailContent({ gig, userId }: { gig: GigDetail; userId: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { fetchGigDetail } = useGigsStore()

  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null)
  const [confirmAction, setConfirmAction] = useState<EscrowTxType | null>(null)
  const [selectedProof, setSelectedProof] = useState<MediaItem | null>(null)
  const [reportGigOpen, setReportGigOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showAcceptNudge, setShowAcceptNudge] = useState(false)
  const { dismissedNudges } = useOnboardingStore()

  const actions = useEscrowActions({
    escrowId: gig.escrow_id,
    chainId: gig.chain_id,
    asset: gig.asset,
    amountRaw: gig.amount_raw,
    // Refused as taken down: re-read so the bar stops offering what the server
    // has just declined. The gate drops the gig entirely on the 404 a
    // non-party now gets, so this is also how a stranger leaves the screen.
    onStale: () => void fetchGigDetail(gig.escrow_id),
  })

  // Worker-net projection for the confirm dialogs (approve/claim quote what
  // is actually credited — the escrow's fee tier, live platform bps).
  const { netRaw, feePct } = useEscrowFee(gig.is_seeker, gig.amount_raw)

  // Approval mode. The flow owns which action opens a sheet, which asks first,
  // and which comes back here for the wallet; each refetches the detail,
  // because its `viewer` block decides the CTA the user sees next.
  const approval = useGigApprovalFlow({
    escrowId: gig.escrow_id,
    onChanged: () => void fetchGigDetail(gig.escrow_id),
    onRequestUnassign: () => setConfirmAction('unassign'),
  })

  // Live-update when the counterparty acts (accept / submit / approve), not
  // just on focus — the escrow WS channel drives the refetch.
  useEscrowLiveRefresh(gig.escrow_id, () => fetchGigDetail(gig.escrow_id), gig.status)

  // Fire the gated transition the confirm dialog was showing, then close it.
  function runConfirmedAction() {
    const action = confirmAction
    setConfirmAction(null)
    switch (action) {
      case 'accept': return void actions.accept()
      case 'approve': return void actions.approve()
      case 'claim_stalled': return void actions.claim()
      case 'cancel': return void actions.cancel()
      case 'refund_expired': return void actions.refund('refund_expired')
      case 'reclaim_abandoned': return void actions.refund('reclaim_abandoned')
      case 'unassign': return void actions.unassign()
      case 'decline': return void actions.decline()
    }
  }

  // The nudge explains ACCEPTING ("once you accept, the payment is already
  // locked…") and links to the accept guide, so it is gated on the gig
  // actually being acceptable by this user. On an approval-mode gig — or
  // someone else's direct invite — the worker applies instead, and teaching
  // them a flow this gig does not offer is the same mode-blindness that made
  // `canAccept` mode-aware in the first place.
  const isWorkerOpportunity = canAccept(partiesOf(gig), userId)

  useFocusEffect(
    useCallback(() => {
      if (isWorkerOpportunity && !dismissedNudges.accept) {
        setShowAcceptNudge(true)
      }
    }, [isWorkerOpportunity, dismissedNudges.accept]),
  )

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetchGigDetail(gig.escrow_id)
    } finally {
      setRefreshing(false)
    }
  }

  function handleShare() {
    const baseUrl = apiConfig[getEnv()].baseUrl
    Share.share({ message: `${gig.title} on Tenda\n${baseUrl}/gig/${gig.escrow_id}` })
  }

  function handleTransactionConfirmed() {
    const action = actions.pendingAction
    actions.clearPending()
    if (action !== null) {
      showToast('success', txSuccessCopy(action, 'gig'))
    }
    if (action === 'accept') {
      // Accepting is a commitment: it earns the just-in-time notification
      // re-ask for a worker who declined the prompt earlier.
      void useNotificationPromptStore.getState().recordCommitment()
    }
    if (action === 'cancel') {
      router.back()
    } else {
      void fetchGigDetail(gig.escrow_id)
    }
  }

  // Sheet-confirmed handlers (sheets collect input; the hook signs).
  async function handleProofsReady(proofs: EscrowProofInput[]): Promise<boolean> {
    const submitted = await actions.submit(proofs)
    // A failed submit is HALF done: the files uploaded, the transaction did
    // not. Re-read so the sheet's "already attached" is the truth when the
    // worker reopens it — without this the prop was empty in exactly the
    // situation it was written for, and the retry demanded the same upload
    // again.
    if (!submitted) void fetchGigDetail(gig.escrow_id)
    return submitted
  }

  async function handleAddProofsReady(proofs: EscrowProofInput[]): Promise<void> {
    if (await actions.addProofs(proofs)) {
      void fetchGigDetail(gig.escrow_id)
    }
  }

  async function handleDisputeReady(reason: string): Promise<boolean> {
    return actions.dispute(reason, gig.dispute_bond_raw)
  }

  return (
    <>
      <NudgeSheet
        visible={showAcceptNudge}
        nudgeKey="accept"
        title="Accepting your first gig"
        body="Once you accept, the payment is already locked in escrow, you just need to complete the work and submit proof. The poster approves and you get paid instantly."
        guideRoute="/(support)/working"
        onClose={() => setShowAcceptNudge(false)}
      />
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
        <DetailChrome
          onBack={() => router.back()}
          rightIcon={Share2}
          rightLabel="Share"
          onRightPress={handleShare}
        />

        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.content, { paddingTop: insets.top + 60 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <GigDetailBody
            gig={gig}
            userId={userId}
            onProofPress={setSelectedProof}
            onReport={() => setReportGigOpen(true)}
            onOpenDisputeThread={() =>
              router.push(`/dispute/${gig.escrow_id}` as Parameters<typeof router.push>[0])
            }
          />
        </ScrollView>

        <GigCTABar
          gig={gig}
          userId={userId}
          isTxBuilding={actions.busyAction !== null}
          txInProgress={actions.pendingTxRef !== null}
          onAction={setActiveSheet}
          onTxAction={setConfirmAction}
          onApprovalAction={approval.handleAction}
          onRetryDraft={() =>
            router.push(`/(tabs)/create-gig?draftId=${gig.escrow_id}` as Parameters<typeof router.push>[0])
          }
        />

        <TxConfirmDialog
          action={confirmAction}
          chainId={gig.chain_id}
          boundSigner={gig.my_signer_address}
          ctx={{
            amount: formatAssetAmount(gig.amount_raw, gig.asset),
            kind: 'gig',
            deliverWithin:
              gig.completion_duration_seconds != null ? formatDuration(gig.completion_duration_seconds) : null,
            netAmount: netRaw !== null ? formatAssetAmount(netRaw.toString(), gig.asset) : null,
            feePct,
          }}
          onConfirm={runConfirmedAction}
          onCancel={() => setConfirmAction(null)}
        />

        <GigActionSheets
          gig={gig}
          activeSheet={activeSheet}
          onClose={() => setActiveSheet(null)}
          onReviewSubmitted={() => fetchGigDetail(gig.escrow_id)}
          onProofsReady={handleProofsReady}
          onAddProofsReady={handleAddProofsReady}
          onDisputeReady={handleDisputeReady}
        />

        <EscrowTransactionMonitor
          actions={actions}
          escrowId={gig.escrow_id}
          chainId={gig.chain_id}
          readDetail={() => api.gigs.get({ id: gig.escrow_id })}
          refresh={() => void fetchGigDetail(gig.escrow_id)}
          onConfirmed={handleTransactionConfirmed}
        />

        <ApplySheet
          visible={approval.applyOpen}
          busy={approval.busy}
          chainId={gig.chain_id}
          initialWallet={gig.viewer?.application?.wallet_address ?? null}
          onClose={approval.closeApply}
          onSubmit={approval.apply}
        />

        {/*
          Off-chain confirms use the styled ConfirmDialog, never Alert.alert
          (project convention) and never TxConfirmDialog — no wallet opens, so
          promising one would be a lie.
        */}
        <ConfirmDialog {...approval.confirmDialog} />

        <MediaViewerModal item={selectedProof} onClose={() => setSelectedProof(null)} />

        <ReportSheet
          visible={reportGigOpen}
          onClose={() => setReportGigOpen(false)}
          contentType="escrow"
          contentId={gig.escrow_id}
        />
      </ScreenContainer>
    </>
  )
}

// ─── Route wrapper ────────────────────────────────────────────────────────────

export default function GigDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <GigDetailGate id={id}>
      {(gig, userId) => <GigDetailContent gig={gig} userId={userId} />}
    </GigDetailGate>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
  },
})
