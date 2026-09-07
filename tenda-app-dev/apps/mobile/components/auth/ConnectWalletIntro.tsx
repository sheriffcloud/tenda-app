import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Wallet, ShieldCheck, Zap } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import { BrandLogo } from '@/components/ui/BrandLogo'

const FEATURES = [
  { Icon: ShieldCheck, title: 'Secure escrow',         description: 'Payments locked until work is approved.' },
  { Icon: Zap,         title: 'Instant settlement',    description: 'Funds released on-chain in seconds.' },
  { Icon: Wallet,      title: 'Your keys, your money', description: 'Non-custodial, you control your wallet.' },
] as const

/** Hero + value-prop list for the connect-wallet screen (static, presentational). */
export function ConnectWalletIntro() {
  const { theme } = useUnistyles()
  return (
    <>
      <View style={s.hero}>
        <View style={s.heroCircleWrap}>
          <View style={[s.heroCircle, { backgroundColor: theme.colors.brand.primarySurface }]}>
            <BrandLogo size={44} />
          </View>
        </View>
        <Text style={[s.heroTitle, { color: theme.colors.content.primary }]}>Connect your wallet</Text>
        <Text style={[s.heroBody, { color: theme.colors.content.secondary }]}>
          Connect a wallet to start posting and accepting gigs on Tenda.
        </Text>
      </View>

      <View style={s.features}>
        {FEATURES.map(({ Icon, title, description }) => (
          <View key={title} style={s.featRow}>
            <View style={[s.featIcon, { backgroundColor: theme.colors.brand.primarySurface }]}>
              <Icon size={18} color={theme.colors.brand.primary} />
            </View>
            <View style={s.featBody}>
              <Text style={[s.featTitle, { color: theme.colors.content.primary }]}>{title}</Text>
              <Text style={[s.featDesc, { color: theme.colors.content.secondary }]}>{description}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  )
}

const s = StyleSheet.create({
  hero: { paddingTop: 8, paddingHorizontal: 28, paddingBottom: 16, alignItems: 'center' },
  heroCircleWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  heroTitle: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.52,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  features: { paddingTop: 8 },
  featRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    minHeight: 56,
  },
  featIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featBody: { flex: 1, minWidth: 0, paddingTop: 1 },
  featTitle: { fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.15 },
  featDesc: { fontSize: 13, lineHeight: 19, marginTop: 2 },
})
