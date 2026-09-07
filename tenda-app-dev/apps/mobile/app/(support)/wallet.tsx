import { View, Linking, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ExternalLink, AlertTriangle } from 'lucide-react-native'
import {
  APP_INFO,
  SUPPORT_WALLET_GUIDE,
  SUPPORT_WALLET_INTRO,
  SUPPORT_WALLET_TROUBLESHOOTING,
  type WalletGuideEntry,
} from '@tenda/shared'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { InfoCard, GuideStep } from '@/components/support'

/** Per-wallet VISUALS + install links stay client-side; the copy is shared. */
const WALLET_VISUALS: Record<
  WalletGuideEntry['id'],
  { colors: [string, string]; initial: string; installUrl?: string }
> = {
  phantom: { colors: ['#AB9FF2', '#6C50F5'], initial: 'P', installUrl: APP_INFO.wallets.phantom.playStore },
  solflare: { colors: ['#FFA96B', '#FC6031'], initial: 'S', installUrl: APP_INFO.wallets.solflare.playStore },
  walletconnect: { colors: ['#3B99FC', '#1A6DF0'], initial: 'W' },
}

const NETWORK_LABEL: Record<WalletGuideEntry['network'], string> = {
  solana: 'Solana wallets',
  evm: 'EVM wallets (Base & Celo)',
}

export default function WalletGuideScreen() {
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Wallet Setup" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <InfoCard label={SUPPORT_WALLET_INTRO.label} body={SUPPORT_WALLET_INTRO.body} />

        {SUPPORT_WALLET_GUIDE.map((wallet, index) => (
          <View key={wallet.id}>
            {(index === 0 || SUPPORT_WALLET_GUIDE[index - 1].network !== wallet.network) && (
              <SectionLabel>{NETWORK_LABEL[wallet.network]}</SectionLabel>
            )}
            {wallet.note !== undefined && (
              <View
                style={[
                  s.warnBanner,
                  {
                    backgroundColor: theme.colors.feedback.warning.surface,
                    borderLeftColor: theme.colors.feedback.warning.base,
                  },
                ]}
              >
                <AlertTriangle size={16} color={theme.colors.feedback.warning.base} />
                <Text style={[s.warnText, { color: theme.colors.feedback.warning.base }]}>{wallet.note}</Text>
              </View>
            )}
            <View
              style={[
                s.card,
                { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
              ]}
            >
              <WalletHeader wallet={wallet} />
              {wallet.steps.map((step, i) => (
                <GuideStep
                  key={step.title}
                  step={i + 1}
                  title={step.title}
                  description={step.description}
                  warning={step.warning}
                  tip={step.tip}
                />
              ))}
            </View>
          </View>
        ))}

        <SectionLabel>Troubleshooting</SectionLabel>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default, paddingHorizontal: 18 },
          ]}
        >
          {SUPPORT_WALLET_TROUBLESHOOTING.map((qa, i) => (
            <AccordionItem
              key={qa.question}
              title={qa.question}
              last={i === SUPPORT_WALLET_TROUBLESHOOTING.length - 1}
            >
              <Text style={[s.body, { color: theme.colors.content.secondary }]}>{qa.answer}</Text>
            </AccordionItem>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

function WalletHeader({ wallet }: { wallet: WalletGuideEntry }) {
  const { theme } = useUnistyles()
  const visuals = WALLET_VISUALS[wallet.id]
  const badgeBg = wallet.badge.tone === 'warning'
    ? theme.colors.feedback.warning.surface
    : theme.colors.feedback.success.surface
  const badgeFg = wallet.badge.tone === 'warning'
    ? theme.colors.feedback.warning.base
    : theme.colors.feedback.success.base
  return (
    <View style={[s.walletHeader, { borderBottomColor: theme.colors.border.subtle }]}>
      <View style={[s.walletLogo, { backgroundColor: visuals.colors[0] }]}>
        <Text style={s.walletLogoText}>{visuals.initial}</Text>
      </View>
      <View style={s.walletBody}>
        <Text style={[s.walletName, { color: theme.colors.content.primary }]}>{wallet.name}</Text>
        <View style={[s.walletBadge, { backgroundColor: badgeBg }]}>
          <View style={[s.walletBadgeDot, { backgroundColor: badgeFg }]} />
          <Text style={[s.walletBadgeText, { color: badgeFg }]}>{wallet.badge.label}</Text>
        </View>
      </View>
      {visuals.installUrl !== undefined && (
        <Pressable
          onPress={() => Linking.openURL(visuals.installUrl ?? '').catch(() => {})}
          style={({ pressed }) => [
            s.installBtn,
            { borderColor: theme.colors.brand.primaryBorder },
            pressed && { backgroundColor: theme.colors.brand.primarySurface },
          ]}
        >
          <Text style={[s.installText, { color: theme.colors.brand.primary }]}>Install</Text>
          <ExternalLink size={12} color={theme.colors.brand.primary} />
        </Pressable>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  scroll: {
    paddingBottom: 16,
  },
  card: {
    marginHorizontal: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 64,
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  walletLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLogoText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  walletBody: {
    flex: 1,
    minWidth: 0,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.075,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginTop: 4,
  },
  walletBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  walletBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  installText: {
    fontSize: 13,
    fontWeight: '600',
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 21,
    paddingBottom: 16,
  },
})
