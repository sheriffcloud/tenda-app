import { useEffect, useState } from 'react'
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Text, Header, Button, showToast } from '@/components/ui'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/api/client'
import { ApiClientError, verifyErrorMessage } from '@tenda/shared'
import { usePostAuthReset } from '@/lib/post-auth-nav'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_S = 60

/** OTP channels that reach this screen (phone SMS or email). */
type OtpChannel = 'phone' | 'email'

/**
 * Generic OTP entry for the unified contact flow (Stage 9C), phone OR email.
 * Two modes share this one screen:
 *   - 'signin' (default, from get-started): verifying sets the session
 *     (signInWithVerify) and resets to home / profile setup.
 *   - 'link' (from Sign-in & security): attaches the verified contact to the
 *     current account (linkIdentity) WITHOUT touching the session, then returns
 *     to the security screen.
 * IDENTITY_ALREADY_LINKED surfaces the Tier-0 message (block, no merge).
 */
export default function VerifyCodeScreen() {
  const { channel, identifier, mode } = useLocalSearchParams<{
    channel: OtpChannel
    identifier: string
    mode?: string
  }>()
  const { theme } = useUnistyles()
  const router = useRouter()
  const signInWithVerify = useAuthStore((s) => s.signInWithVerify)
  const linkIdentity = useAuthStore((s) => s.linkIdentity)
  const resetToAuthedRoot = usePostAuthReset()
  const isLink = mode === 'link'

  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((cd) => cd - 1), 1_000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleVerify(value: string) {
    if (!channel || !identifier || value.length !== CODE_LENGTH || isVerifying) return
    setIsVerifying(true)
    try {
      if (isLink) {
        await linkIdentity({ method: channel, identifier, code: value })
        showToast('success', channel === 'email' ? 'Email verified' : 'Phone verified')
        // Pop both the OTP + contact screens back to Sign-in & security.
        router.dismissTo('/settings/security')
      } else {
        await signInWithVerify({ method: channel, identifier, code: value })
        // reset (not replace) so back can't return to the auth stack after sign-in.
        resetToAuthedRoot(useAuthStore.getState().profileComplete)
      }
    } catch (e) {
      setCode('')
      showToast('error', verifyErrorMessage(e, 'Verification failed, please try again'))
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    if (!channel || !identifier || cooldown > 0) return
    try {
      // Match the original challenge's intent: bearer only when LINKING.
      await api.auth.challenge({ method: channel, identifier }, { link: isLink })
      setCooldown(RESEND_COOLDOWN_S)
      showToast('success', 'A new code is on its way')
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not resend the code')
    }
  }

  const destination = channel === 'email' ? 'email' : 'phone'

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Enter your code" showBack transparent />
        <View style={s.body}>
          <Text style={[s.lede, { color: theme.colors.content.secondary }]}>
            We sent a 6-digit code to your {destination}. Enter it below to continue.
          </Text>

          <OtpCodeField
            value={code}
            onChange={(digits) => {
              setCode(digits)
              if (digits.length === CODE_LENGTH) void handleVerify(digits)
            }}
            length={CODE_LENGTH}
            autoFocus
            editable={!isVerifying}
            accessibilityLabel="Verification code"
          />

          <Button variant="primary" size="lg" fullWidth loading={isVerifying}
            disabled={code.length !== CODE_LENGTH} onPress={() => handleVerify(code)}>
            Verify
          </Button>

          <Button variant="ghost" size="md" fullWidth disabled={cooldown > 0} onPress={handleResend}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  lede: { fontSize: 14, lineHeight: 21 },
})
