import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Landmark, Smartphone } from 'lucide-react-native'
import { radius, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { DeadlineCountdown } from '@/components/shared'
import type { EscrowStatus, ExchangeDetail, ExchangePayoutAccount } from '@tenda/shared'

/**
 * Stages where the accepted buyer still needs to pay / is awaiting confirmation.
 * Deliberately EXCLUDES 'disputed': the card's whole job is "here's how to pay
 * now", which is moot (and misleading — the buyer may already have paid) once a
 * trade is disputed; that context moves to the dispute thread.
 */
const PAYMENT_CONTEXT_STATUSES: EscrowStatus[] = ['accepted', 'submitted']

/**
 * Whether to surface the seller's payout details on the detail screen. Only the
 * accepted BUYER, only while an account is linked, only at a live payment stage.
 * Pure + exported so the gate is unit-tested (it must never show in dispute).
 */
export function shouldShowPaymentInstructions(
  offer: Pick<ExchangeDetail, 'counterparty' | 'payout_account' | 'status'>,
  userId: string,
): boolean {
  return (
    userId === offer.counterparty?.id &&
    offer.payout_account !== null &&
    PAYMENT_CONTEXT_STATUSES.includes(offer.status)
  )
}

interface Props {
  account: ExchangePayoutAccount
  /** Pre-formatted fiat the buyer must send (e.g. "₦150,000"). */
  fiatDisplay: string
  /** Short human reference so the seller can reconcile the transfer. */
  reference: string
  status: EscrowStatus
  /**
   * Live stage deadline (completion_deadline while accepted, approval_deadline
   * once submitted). Drives the ticking urgency banner; null hides it.
   */
  deadline?: Date | string | null
}

/** Status-aware heading + hint + countdown label for the accepted buyer. */
function headline(status: EscrowStatus): { title: string; hint: string; countdownLabel: string } {
  if (status === 'submitted') {
    return {
      title: 'Payment sent',
      hint: 'You marked this as paid. The seller releases the crypto once they confirm receipt.',
      countdownLabel: 'Seller confirms within',
    }
  }
  return {
    title: 'Pay the seller',
    hint: 'Send the exact amount to the account below, then mark it as paid. Only pay through this account.',
    countdownLabel: 'Pay within',
  }
}

/**
 * The #5 fix: once a buyer accepts a sell offer they need the seller's payout
 * details to pay off-platform. This surfaces the full account, the exact fiat
 * amount, and a reference — the context the old detail screen never showed.
 * Rendered only to the accepted buyer (the server gates the account PII).
 */
export function PaymentInstructionsCard({ account, fiatDisplay, reference, status, deadline = null }: Props) {
  const { theme } = useUnistyles()
  const isMomo = account.kind === 'mobile_money'
  const Icon = isMomo ? Smartphone : Landmark
  const { title, hint, countdownLabel } = headline(status)

  const rows: { label: string; value: string }[] = [
    { label: 'Amount to send', value: fiatDisplay },
    { label: isMomo ? 'Network' : 'Bank', value: account.bank_code },
    { label: isMomo ? 'Phone number' : 'Account number', value: account.account_number },
    { label: 'Account name', value: account.account_name },
    { label: 'Reference', value: reference },
  ]

  return (
    <View style={[s.card, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.brand.primary }]}>
      <View style={s.head}>
        <Icon size={18} color={theme.colors.brand.primary} />
        <Text style={[s.title, { color: theme.colors.content.primary }]}>{title}</Text>
      </View>
      <Text style={[s.hint, { color: theme.colors.content.secondary }]}>{hint}</Text>

      {deadline !== null && (
        <View style={s.countdown}>
          <DeadlineCountdown deadline={deadline} label={countdownLabel} size="prominent" />
        </View>
      )}

      <View style={s.rows}>
        {rows.map((row, i) => (
          <View
            key={row.label}
            style={[
              s.row,
              i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
            ]}
          >
            <Text style={[s.rowLabel, { color: theme.colors.content.secondary }]}>{row.label}</Text>
            <Text style={[s.rowValue, { color: theme.colors.content.primary }]} numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2 },
  hint: { fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  countdown: { marginTop: 12 },
  rows: { marginTop: 12 },
  row: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: { fontSize: 13, lineHeight: 18, flexShrink: 0 },
  rowValue: {
    fontFamily: typography.fonts.mono,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
})
