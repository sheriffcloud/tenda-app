import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Wallet } from 'lucide-react-native'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Header } from '@/components/ui/Header'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ConnectWalletIntro } from '@/components/auth/ConnectWalletIntro'
import { TermsNotice } from '@/components/auth/TermsNotice'
import { useAuthStore } from '@/stores/auth.store'
import { WalletPicker } from '@/wallet/picker'
import type { WalletAdapter } from '@/wallet/adapters/types'
import { classifyVerifyError, TIER0_MESSAGE } from '@/lib/auth-flow'
import { usePostAuthReset } from '@/lib/post-auth-nav'
import { classifyConnectError, type ConnectError } from '@/lib/connect-wallet-error'

export default function ConnectWalletScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()
  const [isConnecting, setIsConnecting] = useState(false)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [connectError, setConnectError] = useState<ConnectError | null>(null)
  const signInWithWallet = useAuthStore((st) => st.signInWithWallet)
  const resetToAuthedRoot = usePostAuthReset()

  // Sign in with the wallet the user picked from the sheet. Each adapter owns
  // its own connect+sign round-trip; the store persists the session and routes
  // to onboarding vs home based on profile completeness.
  const handleSelectWallet = async (adapter: WalletAdapter) => {
    setPickerVisible(false)
    setIsConnecting(true)
    setConnectError(null)
    try {
      const ok = await signInWithWallet(adapter)
      if (ok) {
        // Stage 1: incomplete profiles detour through setup before home.
        // reset (not replace) so Android back can't return to the auth stack.
        resetToAuthedRoot(useAuthStore.getState().profileComplete)
      } else {
        setConnectError({ title: 'Connection cancelled', description: 'You closed the wallet prompt. Tap below to try again.' })
      }
    } catch (error) {
      if (__DEV__) console.warn('[connect-wallet] sign-in failed:', error)
      // Decision #3: an unlinked wallet can't sign in or create, steer the
      // user to get-started (a contact method makes the account, then they
      // link this wallet) instead of showing a dead-end error.
      if (classifyVerifyError(error) === 'wallet_not_linked') {
        setConnectError({
          title: 'Wallet not linked',
          description: TIER0_MESSAGE.wallet_not_linked,
          secondaryLabel: 'Get started',
          onSecondaryPress: () => router.replace('/(auth)/get-started'),
        })
      } else {
        setConnectError(classifyConnectError(error))
      }
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <View style={s.screen}>
        <Header showBack transparent />

        {connectError ? (
          <ErrorState
            title={connectError.title}
            description={connectError.description}
            ctaLabel="Try again"
            onCtaPress={() => setConnectError(null)}
            secondaryLabel={connectError.secondaryLabel}
            onSecondaryPress={connectError.onSecondaryPress}
            size="large"
          />
        ) : (
          <>
            <ConnectWalletIntro />

            <View style={s.spacer} />

            {isConnecting && (
              <View style={[s.infoBanner, { backgroundColor: theme.colors.brand.primarySurface }]}>
                <View style={[s.tipIcon, { backgroundColor: theme.colors.brand.primary }]}>
                  <Text style={s.tipGlyph}>i</Text>
                </View>
                <Text style={[s.infoText, { color: theme.colors.brand.primary }]}>
                  If you&apos;re using Solflare, you may need to return to Tenda manually after connecting.
                </Text>
              </View>
            )}

            <View style={s.ctaStack}>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                loading={isConnecting}
                icon={!isConnecting ? <Wallet size={18} color={theme.colors.brand.onPrimary} /> : undefined}
                onPress={() => setPickerVisible(true)}
              >
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </Button>
              {isConnecting ? (
                <Text style={[s.tos, { color: theme.colors.content.tertiary }]}>
                  Waiting for wallet approval, keep Tenda open.
                </Text>
              ) : (
                <TermsNotice verb="connecting" />
              )}
            </View>
          </>
        )}

        <WalletPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} onSelect={handleSelectWallet} />
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  spacer: { flex: 1 },
  infoBanner: {
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  tipIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipGlyph: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  ctaStack: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  tos: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 20 },
})
