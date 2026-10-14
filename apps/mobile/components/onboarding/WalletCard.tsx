import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Wallet as WalletIcon, MoreVertical } from 'lucide-react-native'
import { CHAIN_NAMESPACE_LABEL, truncateWallet, type LinkedWallet } from '@tenda/shared'
import { Text } from '@/components/ui/Text'
import { Badge } from '@/components/ui/Badge'

// The label lives in shared (#42): mobile had this table privately and web had
// none, so the same chain family was named two different things on the two
// screens that let a user choose a main wallet for it.
const CHAIN_LABEL = CHAIN_NAMESPACE_LABEL

interface WalletCardProps {
  wallet: LinkedWallet
  onManage: () => void
}

/** Row in Settings → Linked wallets (stage-1-onboarding.md UI sketch). */
export function WalletCard({ wallet, onManage }: WalletCardProps) {
  const { theme } = useUnistyles()

  return (
    <View
      style={[
        s.row,
        { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
      ]}
    >
      <View style={[s.icon, { backgroundColor: theme.colors.brand.primarySurface }]}>
        <WalletIcon size={18} color={theme.colors.brand.primary} />
      </View>

      <View style={s.body}>
        <View style={s.titleRow}>
          <Text size={14.5} weight="semibold">{CHAIN_LABEL[wallet.chain_ns]}</Text>
          {wallet.is_primary && <Badge label="Primary" variant="brand" />}
          {wallet.verified_at !== null && <Badge label="Verified" variant="success" />}
        </View>
        <Text size={12.5} color={theme.colors.content.secondary}>
          {truncateWallet(wallet.address)}
        </Text>
      </View>

      <Pressable
        onPress={onManage}
        hitSlop={8}
        style={({ pressed }) => [s.manage, pressed && { opacity: 0.6 }]}
        accessibilityLabel={`Manage ${CHAIN_LABEL[wallet.chain_ns]} wallet`}
        accessibilityRole="button"
      >
        <MoreVertical size={18} color={theme.colors.content.tertiary} />
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manage: { padding: 4 },
})
