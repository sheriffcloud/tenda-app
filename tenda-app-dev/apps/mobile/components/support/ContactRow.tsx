import { Linking, View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ExternalLink } from 'lucide-react-native'
import { Text } from '@/components/ui'
import type { LucideIcon } from 'lucide-react-native'

type Tone = 'brand' | 'accent' | 'success'

interface ContactRowProps {
  Icon: LucideIcon
  label: string
  value: string
  /** External URL, opened via `Linking.openURL`. */
  url: string
  /** Icon tile tint, defaults to `brand`. */
  tone?: Tone
  /** Whether to render the bottom hairline. */
  showDivider?: boolean
}

/**
 * Wireframe `contact-row`. 64h row with 40×40 tinted icon, label/value stack,
 * trailing external-link arrow.
 */
export function ContactRow({ Icon, label, value, url, tone = 'brand', showDivider = true }: ContactRowProps) {
  const { theme } = useUnistyles()
  const iconBg =
    tone === 'accent'  ? theme.colors.accent.primarySurface :
    tone === 'success' ? theme.colors.feedback.success.surface :
                         theme.colors.brand.primarySurface
  const iconFg =
    tone === 'accent'  ? theme.colors.accent.primary :
    tone === 'success' ? theme.colors.feedback.success.base :
                         theme.colors.brand.primary

  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={({ pressed }) => [
        s.row,
        showDivider && { borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
        pressed && { backgroundColor: theme.colors.surface.pressed },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[s.ic, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconFg} strokeWidth={2.25} />
      </View>
      <View style={s.body}>
        <Text style={[s.name, { color: theme.colors.content.primary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[s.value, { color: theme.colors.content.secondary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ExternalLink size={14} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.07,
  },
  value: {
    fontSize: 12.5,
    marginTop: 2,
  },
})
