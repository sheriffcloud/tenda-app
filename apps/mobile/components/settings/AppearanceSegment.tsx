import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Sun, Moon, Smartphone } from 'lucide-react-native'
import { Text } from '@/components/ui'

export type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Smartphone },
]

/** Compact segmented control for the theme preference. */
export function AppearanceSegment({
  value,
  onChange,
}: {
  value: ThemeChoice
  onChange: (next: ThemeChoice) => void
}) {
  const { theme } = useUnistyles()
  return (
    <View style={[s.segment, { backgroundColor: theme.colors.surface.inset }]}>
      {THEME_OPTIONS.map((opt) => {
        const selected = value === opt.value
        const Icon = opt.Icon
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              s.segmentItem,
              selected && {
                backgroundColor: theme.colors.surface.card,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
                elevation: 2,
              },
              pressed && !selected && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Icon
              size={15}
              color={selected ? theme.colors.brand.primary : theme.colors.content.tertiary}
              strokeWidth={selected ? 2.25 : 2}
            />
            <Text
              style={[
                s.segmentLabel,
                { color: selected ? theme.colors.content.primary : theme.colors.content.tertiary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  segment: { marginHorizontal: 20, flexDirection: 'row', padding: 4, borderRadius: 12, gap: 4 },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 9,
  },
  segmentLabel: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.135 },
})
