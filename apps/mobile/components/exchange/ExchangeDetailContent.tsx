import { useState } from 'react'
import { ScrollView, StyleSheet, RefreshControl, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { ScreenContainer, Text, Divider, Spacer, showToast } from '@/components/ui'
import { GigActionSheets, type ActiveSheet } from '@/components/gig'
import { ExchangeCTA } from '@/components/exchange'
import { ExchangeOfferOverview } from '@/components/exchange/ExchangeOfferOverview'
import { DetailChrome, DetailBottomBar, DisputeReasonBlock, ReportContentLink, TakedownNotice, TxConfirmDialog, TX_PROGRESS_LABEL, txSuccessCopy } from '@/components/escrow'
import { ReviewsSection, ProofsGrid, type MediaItem } from '@/components/shared'
import { MediaViewerModal } from '@/components/shared/media/MediaViewerModal'
import { TransactionMonitor } from '@/components/feedback'
import { ReportSheet } from '@/components/moderation/ReportSheet'
import { formatFiat } from '@/lib/currency'
import { useEscrowActions, type ProofFile } from '@/hooks/useEscrowActions'
import { useEscrowLiveRefresh } from '@/hooks/useEscrowLiveRefresh'
import { useEscrowFee } from '@/hooks/useEscrowFee'
import { formatAssetAmount } from '@tenda/shared'
import type { EscrowTxType, ExchangeDetail, SupportedCurrency } from '@tenda/shared'
import { checkEscrowTransitionApplied } from '@/lib/escrow-sync'
import { api } from '@/api/client'

/**
 * Exchange detail body, read surface over a kind='exchange' escrow. Every
 * transition rides the shared escrow action hook (sign → broadcast →
 * client-ping), the same leg as gigs; CTA logic lives in ExchangeCTA.
 */
export function ExchangeDetailContent({
  offer,
  userId,
  refresh,
}: {
  offer: ExchangeDetail
  userId: string
  refresh: () => Promise<void>
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme } = useUnistyles()

  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null)
  const [confirmAction, setConfirmAction] = useState<EscrowTxType | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedProof, setSelectedProof] = useState<MediaItem | null>(null)

  const actions = useEscrowActions({
    escrowId: offer.escrow_id,
    chainId: offer.chain_id,
    asset: offer.asset,
    amountRaw: offer.amount_raw,
    // Same as the gig screen: a takedown refusal re-reads rather than leaving
    // the declined button on screen. `refresh` drops the offer on a 404, so a
    // non-party lands on "Offer not available" instead of a dead Accept.
    onStale: () => void refresh(),
  })
  const isCreator = userId === offer.creator.id

  // Buyer-net projection for the confirm dialogs (accept/approve/claim quote
  // what is actually credited, mirroring the contract's settlement math).
  const { netRaw, feePct } = useEscrowFee(offer.is_seeker, offer.amount_raw)

  // Live-update when the counterparty acts (accept / mark-paid / confirm), not
  // just on focus — the escrow WS channel drives the refetch.
  useEscrowLiveRefresh(offer.escrow_id, refresh, offer.status)

  // Fire the gated transition the confirm dialog was showing ('create' here is
  // the draft publish — rebuild + sign the create tx), then close it.
  function runConfirmedAction() {
    const action = confirmAction
    setConfirmAction(null)
    switch (action) {
      case 'create': return void actions.publish()
      case 'accept': return void actions.accept()
      case 'cancel': return void actions.cancel()
      case 'approve': return void actions.approve()
      case 'claim_stalled': return void actions.claim()
      // A direct offer names its buyer, and declining is the only way out of
      // one they do not want — the gig screen has had this since the invite
      // flow shipped; the exchange screen had the branch missing, so an invited
      // buyer whose offer was then taken down had no button at all.
      case 'decline': return void actions.decline()
    }
  }
  const fiat = formatFiat(Number(offer.fiat_amount), offer.fiat_currency as SupportedCurrency)
  const contextTitle = `Trade: ${offer.fiat_amount} ${offer.fiat_currency}`

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  function handleTransactionConfirmed() {
    const action = actions.pendingAction
    actions.clearPending()
    if (action !== null) {
      showToast('success', txSuccessCopy(action, 'exchange'))
    }
    if (action === 'cancel') {
      router.back()
    } else {
      void refresh()
    }
  }

  // Buyer's fiat-payment evidence → off-chain proof rows + on-chain submit.
  async function handleProofsReady(proofs: ProofFile[]): Promise<boolean> {
    return actions.submit(proofs)
  }

  async function handleAddProofsReady(proofs: ProofFile[]): Promise<void> {
    if (await actions.addProofs(proofs)) void refresh()
  }

  async function handleDisputeReady(reason: string): Promise<boolean> {
    return actions.dispute(reason, offer.dispute_bond_raw)
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <DetailChrome onBack={() => router.back()} />

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Renders nothing on a visible offer — see TakedownNotice. */}
        <TakedownNotice escrow={offer} subject="offer" viewerId={userId} />

        <ExchangeOfferOverview offer={offer} userId={userId} fiat={fiat} contextTitle={contextTitle} />

        {offer.proofs.length > 0 && (
          <>
            <Divider />
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Payment proof</Text>
              <Text style={[s.sectionTrail, { color: theme.colors.content.tertiary }]}>
                {offer.proofs.length} {offer.proofs.length === 1 ? 'file' : 'files'}
              </Text>
            </View>
            <Spacer size={spacing.sm} />
            <ProofsGrid proofs={offer.proofs} onProofPress={setSelectedProof} />
          </>
        )}

        {offer.reviews.length > 0 && (
          <>
            <Divider />
            <ReviewsSection
              reviews={offer.reviews}
              partyAId={offer.creator.id}
              partyA={offer.creator}
              partyALabel="Seller"
              partyB={offer.counterparty}
              partyBLabel="Buyer"
              currentUserId={userId}
              title="Reviews"
            />
          </>
        )}

        {offer.dispute && offer.status === 'disputed' && (
          <>
            <Divider />
            <DisputeReasonBlock
              reason={offer.dispute.reason}
              onOpenThread={
                isCreator || userId === offer.counterparty?.id
                  ? () => router.push(`/dispute/${offer.escrow_id}` as Parameters<typeof router.push>[0])
                  : undefined
              }
            />
          </>
        )}

        {!isCreator && (
          <>
            <Divider />
            <ReportContentLink label="Report this offer" onPress={() => setReportOpen(true)} />
          </>
        )}

        <Spacer size={spacing['2xl']} />
      </ScrollView>

      <DetailBottomBar txInProgress={actions.pendingTxRef !== null}>
        <ExchangeCTA
          offer={offer}
          userId={userId}
          busy={actions.busyAction !== null}
          onTxAction={setConfirmAction}
          onSheet={setActiveSheet}
        />
      </DetailBottomBar>

      <TxConfirmDialog
        action={confirmAction}
        ctx={{
          amount: formatAssetAmount(offer.amount_raw, offer.asset),
          kind: 'exchange',
          netAmount: netRaw !== null ? formatAssetAmount(netRaw.toString(), offer.asset) : null,
          feePct,
        }}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />

      <GigActionSheets
        gig={offer}
        activeSheet={activeSheet}
        onClose={() => setActiveSheet(null)}
        onReviewSubmitted={() => void refresh()}
        onProofsReady={handleProofsReady}
        onAddProofsReady={handleAddProofsReady}
        onDisputeReady={handleDisputeReady}
      />

      <TransactionMonitor
        signature={actions.pendingTxRef}
        phase={actions.phase}
        actionLabel={actions.activeAction !== null ? TX_PROGRESS_LABEL[actions.activeAction] : undefined}
        escrowId={offer.escrow_id}
        chainId={offer.chain_id}
        checkApplied={() =>
          checkEscrowTransitionApplied(actions.pendingAction, () => api.exchange.get({ id: offer.escrow_id }))
        }
        onConfirmed={handleTransactionConfirmed}
        onFailed={(msg) => {
          actions.clearPending()
          showToast('info', msg || 'Transaction pending, will sync when confirmed')
        }}
      />

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} contentType="escrow" contentId={offer.escrow_id} />

      <MediaViewerModal item={selectedProof} onClose={() => setSelectedProof(null)} />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.17,
  },
  sectionTrail: {
    fontSize: 12.5,
    lineHeight: 16,
  },
})
