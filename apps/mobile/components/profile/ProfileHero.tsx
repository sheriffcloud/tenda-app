import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { MapPin, Wallet } from 'lucide-react-native'
import { Text, Avatar, SeekerBadge } from '@/components/ui'
import { typography } from '@/theme/tokens'

/** Profile header, avatar ring, name, optional seeker badge, location + wallet pills. */
export function ProfileHero({
  fullName,
  avatarUrl,
  isSeeker,
  city,
  walletShort,
  hasWallet,
}: {
  fullName: string
  avatarUrl?: string | null
  isSeeker: boolean
  city: string | null
  walletShort: string
  hasWallet: boolean
}) {
  const { theme } = useUnistyles()
  return (
    <View style={s.hero}>
      <View style={[s.heroGlow, { backgroundColor: theme.colors.brand.primarySurface }]} />
      <View style={[s.avatarRing, { borderColor: theme.colors.surface.card }]}>
        <Avatar size="xl" name={fullName} src={avatarUrl ?? undefined} />
      </View>
      <Text style={[s.name, { color: theme.colors.content.primary }]}>{fullName}</Text>
      {isSeeker && (
        <View style={s.seekerWrap}>
          <SeekerBadge variant="full" />
        </View>
      )}
      <View style={s.pillRow}>
        <View style={[s.infoPill, { backgroundColor: theme.colors.surface.inset }]}>
          <MapPin size={12} color={theme.colors.content.tertiary} />
          <Text style={[s.infoPillText, { color: theme.colors.content.secondary }]} numberOfLines={1}>
            {city ?? 'Unknown'}
          </Text>
        </View>
        {hasWallet && (
          <View style={[s.infoPill, { backgroundColor: theme.colors.surface.inset }]}>
            <Wallet size={12} color={theme.colors.content.tertiary} />
            <Text style={[s.infoPillMono, { color: theme.colors.content.secondary }]} numberOfLines={1}>
              {walletShort}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, position: 'relative' },
  heroGlow: { position: 'absolute', top: -60, width: 240, height: 240, borderRadius: 120, opacity: 0.5 },
  avatarRing: { borderRadius: 100, borderWidth: 3, marginTop: 12 },
  name: { fontSize: 28, fontWeight: '700', letterSpacing: -0.56, marginTop: 18, textAlign: 'center' },
  seekerWrap: { marginTop: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999 },
  infoPillText: { fontSize: 12.5, fontWeight: '500' },
  infoPillMono: { fontFamily: typography.fonts.mono, fontSize: 11.5, letterSpacing: 0.115 },
})
