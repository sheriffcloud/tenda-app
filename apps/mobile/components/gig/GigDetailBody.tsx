import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Text, Badge, Divider, Spacer } from '@/components/ui'
import { GigMetaInfo } from './GigMetaInfo'
import { ProofRequirementsNote } from './ProofRequirementsNote'
import { STATUS_LABEL, STATUS_BADGE_VARIANT, deadlineLabel } from '@/lib/gig-display'
import { PersonCard, ReviewsSection, ProofsGrid, type MediaItem } from '@/components/shared'
import { DisputeReasonBlock, ReportContentLink, ChainBadge, TakedownNotice } from '@/components/escrow'
import { CATEGORY_META } from '@/lib/categories'
import { computeRelevantDeadline } from '@tenda/shared'
import type { GigDetail } from '@tenda/shared'

interface Props {
  gig: GigDetail
  userId: string
  onProofPress: (proof: MediaItem) => void
  onReport: () => void
  /** CO7: opens the shared dispute-mediation thread (parties only). */
  onOpenDisputeThread?: () => void
}

/** Scroll-body sections of the gig detail screen (badges → report link). */
export function GigDetailBody({ gig, userId, onProofPress, onReport, onOpenDisputeThread }: Props) {
  const { theme } = useUnistyles()
  const [descExpanded, setDescExpanded] = useState(false)

  const isCreator = userId === gig.creator.id
  const isParty =
    isCreator || userId === gig.counterparty?.id || userId === gig.assigned_counterparty_id
  const categoryMeta = CATEGORY_META.find((c) => c.key === gig.category)
  const deadlineLbl = deadlineLabel(computeRelevantDeadline(gig))

  return (
    <>
      {/* Above the status pills: a takedown is the first thing about this gig
          that anyone still able to read it needs to know. Renders nothing when
          the gig is visible, which is why there is no condition here. */}
      <TakedownNotice escrow={gig} subject="gig" viewerId={userId} />

      {/* Status + category dot-label pills */}
      <View style={s.badgeRow}>
        <Badge variant={STATUS_BADGE_VARIANT[gig.status]} label={STATUS_LABEL[gig.status]} />
        {categoryMeta && <Badge variant="brand" label={categoryMeta.label} />}
        {/* Which network the escrow (and its payout) lives on. */}
        <ChainBadge chainId={gig.chain_id} />
      </View>

      <Spacer size={spacing.sm} />
      <Text style={s.gigTitle}>{gig.title}</Text>
      <Spacer size={spacing.md} />

      <GigMetaInfo gig={gig} deadlineLbl={deadlineLbl} />

      <Spacer size={spacing.lg} />

      {/* Description with Read more affordance */}
      {gig.description !== null && (
        <>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Description</Text>
          </View>
          <Spacer size={6} />
          <Text
            style={[s.description, { color: theme.colors.content.primary }]}
            numberOfLines={descExpanded ? undefined : 4}
          >
            {gig.description}
          </Text>
          {!descExpanded && gig.description.length > 200 && (
            <Pressable onPress={() => setDescExpanded(true)} hitSlop={6} style={s.readMore}>
              <Text style={[s.readMoreText, { color: theme.colors.brand.primary }]}>Read more</Text>
            </Pressable>
          )}
          <Spacer size={spacing.lg} />
        </>
      )}

      <PersonCard
        label="Posted by"
        user={gig.creator}
        currentUserId={userId}
        contextId={gig.escrow_id}
        contextTitle={gig.title}
        showMessageButton={gig.status === 'open' || userId === gig.counterparty?.id}
      />

      {/* Worker, only visible to participants (poster + worker) */}
      {gig.counterparty && (isCreator || userId === gig.counterparty.id) && (
        <>
          <Spacer size={spacing.md} />
          <PersonCard
            label="Assigned to"
            user={gig.counterparty}
            currentUserId={userId}
            contextId={gig.escrow_id}
            contextTitle={gig.title}
          />
        </>
      )}

      {gig.reviews.length > 0 && (
        <>
          <Divider />
          <ReviewsSection
            reviews={gig.reviews}
            partyAId={gig.creator.id}
            partyA={gig.creator}
            partyALabel="Poster"
            partyB={gig.counterparty}
            partyBLabel="Worker"
            currentUserId={userId}
            title={`Reviews for @${gig.creator.first_name?.toLowerCase() ?? 'poster'}`}
          />
        </>
      )}

      {gig.proof_requirements.length > 0 && (
        <>
          <Divider />
          <ProofRequirementsNote required={gig.proof_requirements} />
        </>
      )}

      {gig.proofs.length > 0 && (
        <>
          <Divider />
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Proof of work</Text>
            <Text style={[s.sectionTrail, { color: theme.colors.content.tertiary }]}>
              {gig.proofs.length} {gig.proofs.length === 1 ? 'file' : 'files'}
            </Text>
          </View>
          <Spacer size={spacing.sm} />
          <ProofsGrid proofs={gig.proofs} onProofPress={onProofPress} />
        </>
      )}

      {gig.dispute && gig.status === 'disputed' && (
        <>
          <Divider />
          <DisputeReasonBlock
            reason={gig.dispute.reason}
            onOpenThread={isParty ? onOpenDisputeThread : undefined}
          />
        </>
      )}

      {!isCreator && (
        <>
          <Divider />
          <ReportContentLink label="Report this gig" onPress={onReport} />
        </>
      )}

      <Spacer size={spacing['2xl']} />
    </>
  )
}

const s = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  gigTitle: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.52,
  },
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
  description: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  readMore: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  readMoreText: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.135,
  },
})
