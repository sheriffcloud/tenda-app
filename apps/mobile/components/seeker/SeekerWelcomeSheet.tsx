import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { Cpu, Zap, Tag } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { BottomSheet, Text, Button, Spacer } from '@/components/ui'
import { useUnistyles } from 'react-native-unistyles'

const SEEKER_WELCOME_STORAGE_KEY = 'seeker_welcome_shown'

const PERKS = [
  { Icon: Tag,  text: 'Reduced platform fees on all gigs' },
  { Icon: Zap,  text: 'Genesis Seeker badge on your profile' },
  { Icon: Cpu,  text: 'Early access to new features' },
] as const

interface SeekerWelcomeSheetProps {
  onDismiss: () => void
}

export function SeekerWelcomeSheet({ onDismiss }: SeekerWelcomeSheetProps) {
  const { theme } = useUnistyles()
  const [visible, setVisible] = useState(false)
  const dismissalInFlight = useRef(false)

  useEffect(() => {
    let mounted = true
    SecureStore.getItemAsync(SEEKER_WELCOME_STORAGE_KEY)
      .then((shown: string | null) => {
        if (mounted && !shown) setVisible(true)
      })
      .catch(() => {
        if (mounted) setVisible(true)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!visible) dismissalInFlight.current = false
  }, [visible])

  async function handleDismiss() {
    if (dismissalInFlight.current) return
    dismissalInFlight.current = true
    try {
      await SecureStore.setItemAsync(SEEKER_WELCOME_STORAGE_KEY, '1')
    } catch {
      // Persistence is best-effort; a storage failure must not trap the user.
    }
    setVisible(false)
    onDismiss()
  }

  return (
    <BottomSheet visible={visible} onClose={handleDismiss} title="Welcome, Seeker!">
      <View style={[s.iconCircle, {
        backgroundColor: theme.colors.accent.primarySurface,
        borderColor: theme.colors.accent.primaryBorder,
      }]}>
        <Cpu size={32} color={theme.colors.accent.primary} />
      </View>
      <Spacer size={spacing.sm} />
      <Text variant="body" align="center" style={s.subtitle}>
        You&apos;re on Solana&apos;s first crypto-native mobile device. Here&apos;s what you get on Tenda:
      </Text>
      <Spacer size={spacing.lg} />
      <View style={s.perks}>
        {PERKS.map(({ Icon, text }) => (
          <View key={text} style={s.perkRow}>
            <View style={[s.perkIcon, { backgroundColor: theme.colors.accent.primarySurface }]}>
              <Icon size={16} color={theme.colors.accent.primary} />
            </View>
            <Text variant="body">{text}</Text>
          </View>
        ))}
      </View>
      <Spacer size={spacing.xl} />
      <Button variant="primary" fullWidth onPress={handleDismiss}>
        Let&apos;s go
      </Button>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  subtitle: {
    paddingHorizontal: spacing.md,
  },
  perks: {
    gap: spacing.md,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
