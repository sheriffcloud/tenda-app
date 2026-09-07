import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text, Button } from '@/components/ui'
import { spacing } from '@/theme/tokens'

/** One (chain × ERC-20 token) standing approval to the escrow contract. */
export interface AllowanceRowData {
  chainId: string
  chainName: string
  assetId: string
  symbol: string
  decimals: number
  token: string
  spender: string
  /** Base units; null while loading, 'error' when the read failed. */
  allowanceRaw: string | null | 'error'
}

/** Max-uint-style approvals (other dapps grant 2^256−1) read as unlimited. */
const UNLIMITED_THRESHOLD = 2n ** 255n

function formatAllowance(row: AllowanceRowData): string {
  if (row.allowanceRaw === null) return 'Loading…'
  if (row.allowanceRaw === 'error') return 'Unavailable'
  if (row.allowanceRaw === '0') return 'No standing approval'
  const raw = BigInt(row.allowanceRaw)
  if (raw >= UNLIMITED_THRESHOLD) return `Unlimited ${row.symbol}`
  // Exact BigInt split, float division misrounds above 2^53 base units.
  const scale = 10n ** BigInt(row.decimals)
  const whole = raw / scale
  const frac = (raw % scale).toString().padStart(row.decimals, '0').replace(/0+$/, '')
  const wholeStr =
    whole <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(whole).toLocaleString() : whole.toString()
  return `${wholeStr}${frac === '' ? '' : `.${frac}`} ${row.symbol}`
}

interface Props {
  row: AllowanceRowData
  busy: boolean
  onSet: (row: AllowanceRowData) => void
  onRevoke: (row: AllowanceRowData) => void
}

/** Presentational row, the screen owns reads/writes and confirmation. */
export function AllowanceRow({ row, busy, onSet, onRevoke }: Props) {
  const { theme } = useUnistyles()
  const hasAllowance = row.allowanceRaw !== null && row.allowanceRaw !== 'error' && row.allowanceRaw !== '0'
  return (
    <View style={[s.row, { borderColor: theme.colors.border.default }]}>
      <View style={s.info}>
        <Text variant="label">
          {row.symbol} · {row.chainName}
        </Text>
        <Text variant="caption" style={{ color: theme.colors.content.secondary }}>
          {formatAllowance(row)}
        </Text>
      </View>
      <View style={s.actions}>
        <Button variant="secondary" size="sm" disabled={busy} onPress={() => onSet(row)}>
          Set
        </Button>
        {hasAllowance ? (
          <Button variant="danger" size="sm" disabled={busy} onPress={() => onRevoke(row)}>
            Revoke
          </Button>
        ) : null}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  info: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
})
