import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'
import type { LucideIcon } from 'lucide-react-native'

export interface MenuItem {
  Icon: LucideIcon
  label: string
  /** Right-aligned trailing text (mono). */
  value?: string
  /** Tinted icon variant, defaults to 'inset' (neutral) */
  tone?: 'inset' | 'brand' | 'accent'
  onPress: () => void
}

/** Card-grouped list of tappable profile menu rows with tinted icons. */
export function ProfileMenu({ items }: { items: MenuItem[] }) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.group, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
      {items.map((item, index) => {
        const Icon = item.Icon
        const tone = item.tone ?? 'inset'
        const iconBg =
          tone === 'brand'  ? theme.colors.brand.primarySurface :
          tone === 'accent' ? theme.colors.accent.primarySurface :
                              theme.colors.surface.inset
        const iconFg =
          tone === 'brand'  ? theme.colors.brand.primary :
          tone === 'accent' ? theme.colors.accent.primary :
                              theme.colors.content.primary
        return (
          <View key={item.label}>
            {index > 0 && <View style={[s.rowDivider, { backgroundColor: theme.colors.border.subtle }]} />}
            <Pressable
              onPress={item.onPress}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: theme.colors.surface.pressed }]}
            >
              <View style={[s.rowIc, { backgroundColor: iconBg }]}>
                <Icon size={16} color={iconFg} />
              </View>
              <Text style={[s.rowLabel, { color: theme.colors.content.primary }]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.value ? (
                <Text style={[s.rowValue, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
                  {item.value}
                </Text>
              ) : (
                <View style={s.spacer} />
              )}
              <ChevronRight size={16} color={theme.colors.content.tertiary} />
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  group: { marginHorizontal: 20, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: { height: 1, marginLeft: 72 },
  rowIc: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, letterSpacing: -0.075, flexShrink: 1 },
  rowValue: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 12,
    letterSpacing: 0.12,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  spacer: { flex: 1 },
})
