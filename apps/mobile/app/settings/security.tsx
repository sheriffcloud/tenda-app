import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { BadgeCheck, Mail, Phone, Wallet } from 'lucide-react-native'
import type { IdentityMethodWire } from '@tenda/shared'
import { ScreenContainer, Text, Header } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'
import { useAuthStore } from '@/stores/auth.store'

type RouterPush = Parameters<ReturnType<typeof useRouter>['push']>[0]

/** The email shown on the screen: a kind='email' row, or the email an OAuth
 *  (google/apple) sign-in carries. Prefers a verified one and reports its
 *  verified state so the ✓ badge never lies (mirrors the phone row). */
function pickEmail(identities: IdentityMethodWire[]): { value: string; verified: boolean } | null {
  const withEmail = identities.filter(
    (i): i is IdentityMethodWire & { email: string } => i.email !== null && i.email !== '',
  )
  const chosen = withEmail.find((i) => i.verified) ?? withEmail[0]
  return chosen ? { value: chosen.email, verified: chosen.verified } : null
}

function pickPhone(identities: IdentityMethodWire[]): IdentityMethodWire | null {
  return identities.find((i) => i.kind === 'phone') ?? null
}

/**
 * Settings → Sign-in & security. Lists how the user can sign in, email, phone,
 * wallets, and lets them ADD what's missing. Adding a contact reuses the same
 * unified OTP screens as onboarding (continue-with → verify-code) in `link`
 * mode, so there is exactly one contact-verification flow in the app. Wallets
 * link via the existing Linked-wallets screen.
 */
export default function SecuritySettingsScreen() {
  const { theme } = useUnistyles()
  const router = useRouter()
  const identities = useAuthStore((s) => s.identities)
  const wallets = useAuthStore((s) => s.wallets)
  const loadMethods = useAuthStore((s) => s.loadMethods)
  const refreshMe = useAuthStore((s) => s.refreshMe)

  // Re-fetch on focus so a freshly-linked contact/wallet shows on return.
  useFocusEffect(
    useCallback(() => {
      void loadMethods()
      void refreshMe()
    }, [loadMethods, refreshMe]),
  )

  const email = pickEmail(identities)
  const phone = pickPhone(identities)
  const check = <BadgeCheck size={18} color={theme.colors.feedback.success.base} />

  function goAdd(method: 'email' | 'phone'): void {
    router.push({ pathname: '/(auth)/continue-with', params: { method, mode: 'link' } } as RouterPush)
  }

  return (
    <ScreenContainer scroll padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Sign-in & security" showBack onBackPress={() => router.back()} />

      <Text style={[s.lede, { color: theme.colors.content.secondary }]}>
        These are the ways you can sign in to your account. Add a verified email
        or phone so we can always reach you, and so you never lose access.
      </Text>

      <SectionLabel tight>Contacts</SectionLabel>
      <SettingsGroup>
        {email !== null && email.verified ? (
          <SettingsRow
            icon={<Mail size={16} color={theme.colors.content.primary} />}
            label="Email"
            value={email.value}
            trailing={check}
          />
        ) : (
          <SettingsRow
            icon={<Mail size={16} color={theme.colors.content.primary} />}
            label="Add email"
            onPress={() => goAdd('email')}
            showChevron
          />
        )}

        {phone !== null && phone.verified ? (
          <SettingsRow
            icon={<Phone size={16} color={theme.colors.content.primary} />}
            label="Phone"
            value={phone.identifier}
            trailing={check}
          />
        ) : (
          <SettingsRow
            icon={<Phone size={16} color={theme.colors.content.primary} />}
            label="Verify phone number"
            onPress={() => goAdd('phone')}
            showChevron
          />
        )}
      </SettingsGroup>

      <SectionLabel>Wallets</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Wallet size={16} color={theme.colors.content.primary} />}
          label="Linked wallets"
          value={wallets.length > 0 ? String(wallets.length) : undefined}
          onPress={() => router.push('/settings/linked-wallets' as RouterPush)}
          showChevron
        />
      </SettingsGroup>

      <View style={s.footer}>
        <Text size={12.5} color={theme.colors.content.tertiary} style={s.footerText}>
          Verifying a phone with a Solana wallet linked unlocks a one-time SOL
          top-up for network fees.
        </Text>
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  lede: { fontSize: 13.5, lineHeight: 19, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 14 },
  footerText: { lineHeight: 17 },
})
