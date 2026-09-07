import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Briefcase, ArrowLeftRight } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import type { UserEscrowTransaction } from '@tenda/shared'
import { txDisplayAmount, txLabel, txSign, viewerRole } from './tx-copy'

/**
 * One row of the wallet feed, worded and signed from the VIEWER's side — the
 * same on-chain transaction reads differently to each party. All of that lives
 * in tx-copy.ts; this component only renders.
 */
interface TxRowProps {
  tx: UserEscrowTransaction
  userId: string
}

export function TxRow({ tx, userId }: TxRowProps) {
  const { theme } = useUnistyles()

  const isGig = tx.escrow.kind === 'gig'
  const Icon = isGig ? Briefcase : ArrowLeftRight
  const iconBg = isGig ? theme.colors.brand.primarySurface : theme.colors.accent.primarySurface
  const iconColor = isGig ? theme.colors.brand.primary : theme.colors.accent.primary

  // Derived once and threaded through: label, sign and amount all key off it.
  const role = viewerRole(tx, userId)
  const sign = txSign(tx, role)
  const amountColor =
    sign === '+'
      ? theme.colors.numeric.positive
      : sign === '-'
        ? theme.colors.numeric.negative
        : theme.colors.content.secondary

  const money = txDisplayAmount(tx, role)
  const subtitle = txLabel(tx.escrow.kind, tx.type, role)
  const title = tx.escrow.title ?? (isGig ? 'Gig' : 'Exchange')

  return (
    <View style={[s.row, { borderBottomColor: theme.colors.border.subtle }]}>
      <View style={[s.icon, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} />
      </View>

      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[s.sub, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {money !== null && (
        <View style={s.amt}>
          <Text style={[s.amtMain, { color: amountColor }]} numberOfLines={1}>
            {sign ? `${sign} ` : ''}
            {money.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
          </Text>
          <Text style={[s.amtUnit, { color: theme.colors.content.tertiary }]}>{money.symbol}</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  sub: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  amt: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amtMain: {
    fontFamily: typography.fonts.mono,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  amtUnit: {
    fontFamily: typography.fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
  },
})
