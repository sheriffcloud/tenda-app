import { View, Linking, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ExternalLink, AlertTriangle } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { InfoCard, GuideStep } from '@/components/support'
import { APP_INFO } from '@/lib/app-info'

export default function WalletGuideScreen() {
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Wallet Setup" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <InfoCard
          label="What is a crypto wallet?"
          body="A wallet is an app that holds your digital money and lets you sign transactions. Tenda needs one to deliver escrow payouts directly to you on-chain."
        />

        {/* Phantom */}
        <SectionLabel>Phantom (recommended)</SectionLabel>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <WalletHeader
            name="Phantom"
            colors={['#AB9FF2', '#6C50F5']}
            initial="P"
            badge={{ label: 'Returns to Tenda automatically', tone: 'success' }}
            installUrl={APP_INFO.wallets.phantom.playStore}
          />
          <GuideStep step={1} title="Install Phantom" description="Grab it from the App Store or Play Store, or from the Phantom website." />
          <GuideStep
            step={2}
            title="Create or import a wallet"
            description="Set a passcode. Write down your recovery phrase on paper and never screenshot it."
            warning="Anyone with your recovery phrase can empty your wallet."
          />
          <GuideStep step={3} title="Come back to Tenda" description="Tap Connect Wallet, Wallet opens, you approve, and you're back here automatically." />
        </View>

        {/* Solflare */}
        <SectionLabel>Solflare</SectionLabel>
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
          <Text style={[s.warnText, { color: theme.colors.feedback.warning.base }]}>
            Solflare doesn&apos;t auto-return you to Tenda on some devices. You may need to switch apps manually after connecting.
          </Text>
        </View>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          <WalletHeader
            name="Solflare"
            colors={['#FFA96B', '#FC6031']}
            initial="S"
            badge={{ label: 'Manual return required', tone: 'warning' }}
            installUrl={APP_INFO.wallets.solflare.playStore}
          />
          <GuideStep step={1} title="Install Solflare" description="App Store, Play Store, or browser extension." />
          <GuideStep
            step={2}
            title="Set up your wallet"
            description="Create new or import. Save the recovery phrase offline."
            tip="Use the hardware wallet option if you have a Ledger. Solflare supports it natively."
          />
          <GuideStep step={3} title="Return to Tenda manually" description="After approving in Solflare, switch back to Tenda by tapping the Tenda icon or your task switcher." />
        </View>

        {/* Troubleshooting */}
        <SectionLabel>Troubleshooting</SectionLabel>
        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default, paddingHorizontal: 18 },
          ]}
        >
          <AccordionItem title="Connection keeps failing">
            <Text style={[s.body, { color: theme.colors.content.secondary }]}>
              1. Make sure your wallet app is installed and fully set up.{'\n'}
              2. If using Solflare, complete the seed phrase backup inside Solflare first.{'\n'}
              3. Check your internet connection.{'\n'}
              4. Close and reopen Tenda, then try again.
            </Text>
          </AccordionItem>
          <AccordionItem title="I closed the wallet by mistake">
            <Text style={[s.body, { color: theme.colors.content.secondary }]}>
              Tap &quot;Try again&quot; on the error screen, then &quot;Connect Wallet&quot; to reopen the prompt.
            </Text>
          </AccordionItem>
          <AccordionItem title="My wallet isn't listed" last>
            <Text style={[s.body, { color: theme.colors.content.secondary }]}>
              Tenda officially supports Phantom and Solflare. Other wallets that support the Solana Mobile Wallet Adapter may also work but are not tested yet.
            </Text>
          </AccordionItem>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

interface WalletHeaderProps {
  name: string
  initial: string
  colors: [string, string]
  badge: { label: string; tone: 'success' | 'warning' }
  installUrl: string
}

function WalletHeader({ name, initial, colors, badge, installUrl }: WalletHeaderProps) {
  const { theme } = useUnistyles()
  const badgeBg = badge.tone === 'warning'
    ? theme.colors.feedback.warning.surface
    : theme.colors.feedback.success.surface
  const badgeFg = badge.tone === 'warning'
    ? theme.colors.feedback.warning.base
    : theme.colors.feedback.success.base
  return (
    <View style={[s.walletHeader, { borderBottomColor: theme.colors.border.subtle }]}>
      <View style={[s.walletLogo, { backgroundColor: colors[0] }]}>
        <Text style={s.walletLogoText}>{initial}</Text>
      </View>
      <View style={s.walletBody}>
        <Text style={[s.walletName, { color: theme.colors.content.primary }]}>{name}</Text>
        <View style={[s.walletBadge, { backgroundColor: badgeBg }]}>
          <View style={[s.walletBadgeDot, { backgroundColor: badgeFg }]} />
          <Text style={[s.walletBadgeText, { color: badgeFg }]}>{badge.label}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => Linking.openURL(installUrl).catch(() => {})}
        style={({ pressed }) => [
          s.installBtn,
          { borderColor: theme.colors.brand.primaryBorder },
          pressed && { backgroundColor: theme.colors.brand.primarySurface },
        ]}
      >
        <Text style={[s.installText, { color: theme.colors.brand.primary }]}>Install</Text>
        <ExternalLink size={12} color={theme.colors.brand.primary} />
      </Pressable>
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

// Suppress unused warning for typography import, kept for future tweaks.
void typography
