import { useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Mail, Phone, Wallet } from 'lucide-react-native'
import { ScreenContainer, Text, Header, Button, BrandLogo, showToast } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'
import { signInWithGoogle, configureGoogleSignIn, GoogleSignInError } from '@/lib/google-signin'
import { signInWithApple, isAppleAvailable, AppleSignInError } from '@/lib/apple-signin'
import { verifyErrorMessage } from '@/lib/auth-flow'
import { usePostAuthReset } from '@/lib/post-auth-nav'

type Busy = null | 'google' | 'apple'

/**
 * Stage 9C get-started, the multi-method entry. Google/Apple verify an
 * id_token inline; phone/email push to the contact route (continue-with) which
 * issues the OTP; wallet routes to connect-wallet. A new account is born from a
 * contact-bearing method (decision #3, wallet signs in, never creates). The
 * layout mirrors welcome: a centred brand hero over a bottom method stack.
 */
export default function GetStartedScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()
  const signInWithVerify = useAuthStore((s) => s.signInWithVerify)
  const resetToAuthedRoot = usePostAuthReset()

  const [busy, setBusy] = useState<Busy>(null)
  const [appleAvailable, setAppleAvailable] = useState(false)

  useEffect(() => {
    void isAppleAvailable().then(setAppleAvailable)
    // Client IDs are USER-ACTION env (undefined → Google sign-in fails cleanly).
    configureGoogleSignIn(
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    )
  }, [])

  function reportError(e: unknown): void {
    showToast('error', verifyErrorMessage(e, 'Something went wrong, please try again'))
  }

  function afterAuth(): void {
    // reset (not replace) so back can't return to the auth stack after sign-in.
    resetToAuthedRoot(useAuthStore.getState().profileComplete)
  }

  async function handleGoogle(): Promise<void> {
    setBusy('google')
    try {
      const idToken = await signInWithGoogle()
      await signInWithVerify({ method: 'google', id_token: idToken })
      afterAuth()
    } catch (e) {
      if (e instanceof GoogleSignInError) {
        if (e.reason === 'cancelled') return
        // Show the native reason directly (esp. developer_error / no_id_token) so
        // config problems in a build are diagnosable instead of a generic toast.
        console.warn('[google-signin]', e.reason, e.message)
        showToast('error', e.message)
        return
      }
      reportError(e)
    } finally {
      setBusy(null)
    }
  }

  async function handleApple(): Promise<void> {
    setBusy('apple')
    try {
      const { idToken } = await signInWithApple()
      await signInWithVerify({ method: 'apple', id_token: idToken })
      afterAuth()
    } catch (e) {
      if (e instanceof AppleSignInError && e.reason === 'cancelled') return
      reportError(e)
    } finally {
      setBusy(null)
    }
  }

  function goToContact(method: 'phone' | 'email'): void {
    router.push({ pathname: '/(auth)/continue-with', params: { method } })
  }

  const anyBusy = busy !== null

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <View style={s.flex}>
        <Header showBack transparent />

        <ScrollView
          style={s.flex}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={[s.logoWrap, { shadowColor: theme.colors.brand.primary }]}>
              <BrandLogo size={64} />
            </View>
            <Text style={[s.title, { color: theme.colors.content.primary }]}>Get started</Text>
            <Text style={[s.subtitle, { color: theme.colors.content.secondary }]}>
              Choose how you’d like to continue. You can link a wallet later when you’re ready to transact.
            </Text>
          </View>

          <View style={s.methods}>
            <Button variant="outline" size="lg" fullWidth loading={busy === 'google'} disabled={anyBusy}
              onPress={handleGoogle}>
              Continue with Google
            </Button>

            {appleAvailable && (
              <Button variant="outline" size="lg" fullWidth loading={busy === 'apple'} disabled={anyBusy}
                onPress={handleApple}>
                Continue with Apple
              </Button>
            )}

            <Button variant="outline" size="lg" fullWidth disabled={anyBusy}
              icon={<Phone size={18} color={theme.colors.content.primary} />}
              onPress={() => goToContact('phone')}>
              Continue with phone
            </Button>

            <Button variant="outline" size="lg" fullWidth disabled={anyBusy}
              icon={<Mail size={18} color={theme.colors.content.primary} />}
              onPress={() => goToContact('email')}>
              Continue with email
            </Button>

            <Button variant="ghost" size="md" fullWidth disabled={anyBusy}
              icon={<Wallet size={16} color={theme.colors.content.secondary} />}
              onPress={() => router.push('/(auth)/connect-wallet')}>
              Sign in with a wallet
            </Button>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 28,
    gap: 28,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  logoWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  methods: {
    paddingHorizontal: 20,
    gap: 12,
  },
})
