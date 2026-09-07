/**
 * The poster's applicant shortlist for one approval-mode gig, and the assign
 * transaction that ends it.
 *
 * A screen of its own rather than a section of the gig detail: assigning is a
 * wallet-opening decision made by comparing people, and it needs the room. The
 * transaction rides the same gate every other transition does — TxConfirmDialog
 * before the wallet, TransactionMonitor until it confirms — so a worker is
 * never assigned by a single ambiguous tap.
 */
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { formatAssetAmount, canAssign, type GigApplicant, type GigDetail, formatDuration, checkEscrowTransitionApplied } from '@tenda/shared'
import { ScreenContainer, Header, showToast } from '@/components/ui'
import { TransactionMonitor } from '@/components/feedback'
import { TakedownNotice, TxConfirmDialog } from '@/components/escrow'
import { TX_PROGRESS_LABEL, txSuccessCopy } from '@tenda/shared'
import { GigDetailGate } from '@/components/gig'
import { approvalContextOf } from '@tenda/shared'
import { ApplicantList, useApplicantList, type ApplicantFilter } from '@/components/gig/gig-applications'
import { useEscrowActions } from '@/hooks/useEscrowActions'
import { useEscrowLiveRefresh } from '@/hooks/useEscrowLiveRefresh'
import { useGigsStore } from '@/stores'
import { spacing } from '@/theme/tokens'
import { api } from '@/api/client'

function ApplicantsContent({ gig, userId }: { gig: GigDetail; userId: string }) {
  const router = useRouter()
  const { fetchGigDetail } = useGigsStore()
  const [filter, setFilter] = useState<ApplicantFilter>('open')
  const [pending, setPending] = useState<GigApplicant | null>(null)

  const { applicants, error, load } = useApplicantList(gig.escrow_id, filter)
  const refresh = useCallback(async () => {
    await Promise.all([fetchGigDetail(gig.escrow_id), load()])
  }, [fetchGigDetail, gig.escrow_id, load])

  // Assignments can confirm after the wallet monitor has timed out. Keep both
  // halves of this screen converged: the gig controls whether Assign is legal,
  // while the applicant list controls which rows are still pending.
  useEscrowLiveRefresh(gig.escrow_id, refresh, gig.status)
  const actions = useEscrowActions({
    escrowId: gig.escrow_id,
    chainId: gig.chain_id,
    asset: gig.asset,
    amountRaw: gig.amount_raw,
    // The THIRD screen that dispatches an entry action (`assign_accept`), and
    // the one easiest to forget — it is not a detail screen, but a takedown
    // stops it dead just the same. Re-reading the gig is what clears
    // `assignable`, so the rows stop offering a button the server refuses.
    onStale: () => void fetchGigDetail(gig.escrow_id),
  })

  // Reload on focus AND whenever the filter changes: coming back from a
  // confirmed assignment must not leave the shortlist showing everyone as
  // still waiting.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // One shared rule for the whole screen, from the shared helper — so the
  // rows, the gate and the server cannot disagree about whether this gig can
  // still be assigned. The party shape comes from `approvalContextOf` rather
  // than being rebuilt here: a hand-built copy is what silently misses a new
  // acceptance-mode field.
  const assignable = canAssign(approvalContextOf(gig), userId)

  function handleConfirmed() {
    const action = actions.pendingAction
    actions.clearPending()
    if (action !== null) showToast('success', txSuccessCopy(action, 'gig'))
    void fetchGigDetail(gig.escrow_id)
    // The gig is no longer open, so the shortlist is history now — the detail
    // screen is where the poster tracks the work from here.
    router.back()
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Applicants" showBack />

      {/* Otherwise a takedown reads as a bug here: `assignable` goes false, the
          Assign buttons quietly vanish, and the poster is left looking at a
          shortlist they cannot act on with nothing saying why.

          The `hidden` check is on the WRAPPER, not left to the component's own
          empty render, because the wrapper carries padding — this screen is
          `padding={false}` and the notice would otherwise touch both edges. An
          unconditional wrapper reserves that padding as blank space above the
          list on every visible gig, which is a layout regression paid by the
          99% case to serve the 1%. */}
      {gig.hidden && (
        <View style={s.notice}>
          <TakedownNotice escrow={gig} subject="gig" viewerId={userId} />
        </View>
      )}

      <ApplicantList
        applicants={applicants}
        error={error}
        filter={filter}
        onFilterChange={setFilter}
        assignable={assignable}
        busy={actions.busyAction !== null || actions.pendingTxRef !== null}
        onAssign={setPending}
      />

      <TxConfirmDialog
        action={pending !== null ? 'assign_accept' : null}
        chainId={gig.chain_id}
        // The POSTER signs an assign, so the binding previewed is theirs — the
        // wire is viewer-relative, so this is never the applicant's wallet.
        boundSigner={gig.my_signer_address}
        ctx={{
          amount: formatAssetAmount(gig.amount_raw, gig.asset),
          kind: 'gig',
          deliverWithin:
            gig.completion_duration_seconds != null
              ? formatDuration(gig.completion_duration_seconds)
              : null,
        }}
        onConfirm={() => {
          const applicant = pending
          setPending(null)
          if (applicant !== null) void actions.assign(applicant.applicant_id)
        }}
        onCancel={() => setPending(null)}
      />

      <TransactionMonitor
        signature={actions.pendingTxRef}
        phase={actions.phase}
        actionLabel={
          actions.activeAction !== null ? TX_PROGRESS_LABEL[actions.activeAction] : undefined
        }
        escrowId={gig.escrow_id}
        chainId={gig.chain_id}
        checkApplied={() =>
          checkEscrowTransitionApplied(actions.pendingAction, () => api.gigs.get({ id: gig.escrow_id }))
        }
        onConfirmed={handleConfirmed}
        onFailed={(msg) => {
          actions.clearPending()
          showToast('info', msg || 'Transaction pending, will sync when confirmed')
          void load()
        }}
      />
    </ScreenContainer>
  )
}

export default function ApplicantsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  // Creator-gated: the shortlist route is poster-only server-side, so anyone
  // else would be looking at a screen whose every request 403s.
  return (
    <GigDetailGate id={id} requireCreator>
      {(gig, userId) => <ApplicantsContent gig={gig} userId={userId} />}
    </GigDetailGate>
  )
}

const s = StyleSheet.create({
  notice: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
})
