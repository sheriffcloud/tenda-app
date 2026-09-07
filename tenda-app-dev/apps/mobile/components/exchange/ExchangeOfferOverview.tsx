import { View, StyleSheet } from 'react-native'
import { spacing, typography } from '@/theme/tokens'
import { Text, Badge, Spacer } from '@/components/ui'
import { ChainBadge } from '@/components/escrow'
import { PersonCard } from '@/components/shared'
import { ExchangeStatusBadge } from './ExchangeStatusBadge'
import { ExchangeTermsCard } from './ExchangeTermsCard'
import { PaymentInstructionsCard, shouldShowPaymentInstructions } from './PaymentInstructionsCard'
import { SellerPayoutCard, shouldShowSellerPayout } from './SellerPayoutCard'
import { formatAssetAmount, computeRelevantDeadline } from '@tenda/shared'
import type { ExchangeDetail } from '@tenda/shared'

interface Props {
  offer: ExchangeDetail
  userId: string
  /** Pre-formatted fiat leg (e.g. "₦150,000") — computed once by the parent. */
  fiat: string
  /** Chat context line for the person cards. */
  contextTitle: string
}

/**
 * Top block of the exchange detail scroll: status + network badges, the
 * trade headline, terms (incl. buyer net), the side-appropriate payout
 * context (buyer instructions vs seller account), and the party cards.
 */
export function ExchangeOfferOverview({ offer, userId, fiat, contextTitle }: Props) {
  const isCreator = userId === offer.creator.id

  return (
    <>
      <View style={s.badgeRow}>
        <ExchangeStatusBadge status={offer.status} />
        <Badge variant="accent" label="P2P Trade" />
        <ChainBadge chainId={offer.chain_id} />
      </View>

      <Spacer size={spacing.sm} />
      <Text style={s.title}>
        {formatAssetAmount(offer.amount_raw, offer.asset)} → {fiat}
      </Text>
      <Spacer size={spacing.md} />

      <ExchangeTermsCard offer={offer} />

      {/* Accepted buyer's payment context: the seller's account, the exact
          amount, and a reference. Hidden once disputed (see
          shouldShowPaymentInstructions). */}
      {shouldShowPaymentInstructions(offer, userId) && offer.payout_account !== null && (
        <>
          <Spacer size={spacing.md} />
          <PaymentInstructionsCard
            account={offer.payout_account}
            fiatDisplay={fiat}
            reference={offer.escrow_id.slice(0, 8).toUpperCase()}
            status={offer.status}
            deadline={computeRelevantDeadline(offer)}
          />
        </>
      )}

      {/* Seller's mirror of the same account: which of THEIR accounts the
          buyer pays into (drafts included, so publishing is fully informed). */}
      {shouldShowSellerPayout(offer, userId) && offer.payout_account !== null && (
        <>
          <Spacer size={spacing.md} />
          <SellerPayoutCard account={offer.payout_account} />
        </>
      )}

      <Spacer size={spacing.lg} />

      <PersonCard
        label="Seller"
        user={offer.creator}
        currentUserId={userId}
        contextId={offer.escrow_id}
        contextTitle={contextTitle}
        isOffer
        showMessageButton={offer.status !== 'draft'}
      />

      {offer.counterparty && (isCreator || userId === offer.counterparty.id) && (
        <>
          <Spacer size={spacing.md} />
          <PersonCard
            label="Buyer"
            user={offer.counterparty}
            currentUserId={userId}
            contextId={offer.escrow_id}
            contextTitle={contextTitle}
            isOffer
            gradient="brand"
          />
        </>
      )}
    </>
  )
}

const s = StyleSheet.create({
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.44,
  },
})
