import { useCallback } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import {
  LogOut,
  ClipboardList,
  UserPen,
  Settings,
  CircleHelp,
  CircleDollarSign,
  Scale,
} from 'lucide-react-native'
import { ScreenContainer, Text, Spacer, AppVersion } from '@/components/ui'
import { Header } from '@/components/ui/Header'
import { RestrictionBanner } from '@/components/reputation'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SeekerWelcomeSheet } from '@/components/seeker/SeekerWelcomeSheet'
import { ProfileHero, ProfileStats, ProfileMenu } from '@/components/profile'
import type { MenuItem } from '@/components/profile'
import { useAuthStore } from '@/stores/auth.store'
import { useProfileStats } from '@/hooks/useProfileStats'
import { displayWalletAddress, truncateWallet, formatFullName } from '@tenda/shared'

export default function ProfileScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()
  const { user, logout, refreshUser } = useAuthStore()
  const wallets = useAuthStore((s) => s.wallets)
  const sessionWallet = useAuthStore((s) => s.walletAddress)

  // Counts come from server-side COUNTs, not from filtering a capped page
  // of gig rows (open_issues MB2).
  const stats = useProfileStats(user?.id)

  // `useProfileStats` owns its own focus refetch — calling stats.reload() here
  // as well would double every load.
  useFocusEffect(
    useCallback(() => {
      refreshUser()
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  )

  const fullName = formatFullName(user?.first_name ?? null, user?.last_name ?? null) || 'Anonymous'

  // The same handle rule the drawer uses — see `displayWalletAddress`. Two
  // copies of `find(w => w.is_primary)` is how the profile and the drawer end
  // up naming a different wallet as "yours" on the same screen-load, now that
  // the marker is per chain family (#42).
  const primaryWallet = displayWalletAddress(wallets, sessionWallet)
  const walletShort = primaryWallet ? truncateWallet(primaryWallet) : '—'

  // v2 review_score is already a 0–5 average (numeric(3,2) → string).
  const reputationDisplay = user?.review_score ? Number(user.review_score).toFixed(1) : '—'

  const accountItems: MenuItem[] = [
    {
      Icon: UserPen,
      label: 'Update profile',
      tone: user?.is_seeker ? 'accent' : 'inset',
      onPress: () => router.push('/(tabs)/update-profile'),
    },
    {
      Icon: ClipboardList,
      label: 'My gigs',
      tone: 'brand',
      value: stats.active > 0 ? `${stats.active} active` : undefined,
      onPress: () => router.push('/(tabs)/my-gigs'),
    },
    {
      Icon: CircleDollarSign,
      label: 'Wallet',
      tone: 'brand',
      value: walletShort,
      onPress: () => router.push('/(tabs)/wallet'),
    },
    {
      Icon: Scale,
      label: 'My disputes',
      // Typed-routes are dev-server-generated; cast until /disputes is in the map.
      onPress: () => router.push('/disputes' as Parameters<typeof router.push>[0]),
    },
  ]

  const supportItems: MenuItem[] = [
    { Icon: Settings, label: 'Settings', onPress: () => router.push('/(tabs)/settings') },
    { Icon: CircleHelp, label: 'Help & Guide', onPress: () => router.push('/(support)/faq' as never) },
  ]

  return (
    <ScreenContainer scroll padding={false} edges={['left', 'right']}>
      <Header title="Profile" showBack />
      <RestrictionBanner />

      <ProfileHero
        fullName={fullName}
        avatarUrl={user?.avatar_url}
        isSeeker={user?.is_seeker ?? false}
        city={user?.city ?? null}
        walletShort={walletShort}
        hasWallet={primaryWallet !== null}
      />

      <ProfileStats
        completed={stats.completed}
        posted={stats.posted}
        reputation={reputationDisplay}
        status={stats.status}
        onRetry={stats.reload}
      />

      <SectionLabel>Account</SectionLabel>
      <ProfileMenu items={accountItems} />

      <SectionLabel>Support</SectionLabel>
      <ProfileMenu items={supportItems} />

      <Pressable
        onPress={async () => {
          await logout()
          router.replace('/(auth)/welcome')
        }}
        style={({ pressed }) => [
          s.disconnect,
          {
            borderColor: theme.colors.feedback.danger.base,
            backgroundColor: pressed ? theme.colors.feedback.danger.surface : 'transparent',
          },
        ]}
      >
        <LogOut size={16} color={theme.colors.feedback.danger.base} />
        <Text style={[s.disconnectText, { color: theme.colors.feedback.danger.base }]}>Disconnect</Text>
      </Pressable>

      <AppVersion marginTop={18} />
      <Spacer size={20} />

      {user?.is_seeker && <SeekerWelcomeSheet onDismiss={() => {}} />}
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  disconnect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    marginHorizontal: 20,
    marginTop: 32,
    borderWidth: 1,
    borderRadius: 14,
  },
  disconnectText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.15 },
})
