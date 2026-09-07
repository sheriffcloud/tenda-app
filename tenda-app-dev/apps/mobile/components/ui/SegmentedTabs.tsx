import { View, Pressable, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'

export interface SegmentTab {
  key: string
  label: string
}

/**
 * Per-item style: the selected pill (card bg + shadow) and a subtle pressed
 * dim for the inactive tabs. Extracted as a pure fn so the visual branches are
 * unit-testable without simulating Pressable's internal press state.
 */
export function segmentItemStyle(selected: boolean, pressed: boolean, cardColor: string): StyleProp<ViewStyle> {
  return [
    s.item,
    selected && { backgroundColor: cardColor, ...SELECTED_SHADOW },
    pressed && !selected && { opacity: 0.7 },
  ]
}

/**
 * Controlled segmented control: a pill row that switches between mutually
 * exclusive views (e.g. the sell screen's Instant / Create-offer tabs). The
 * caller renders the body for `value`; this owns only the switch. Reusable,
 * with the same visual language as AppearanceSegment.
 */
export function SegmentedTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly SegmentTab[]
  value: string
  onChange: (key: string) => void
}) {
  const { theme } = useUnistyles()
  return (
    <View
      style={[s.segment, { backgroundColor: theme.colors.surface.inset }]}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const selected = value === tab.key
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => segmentItemStyle(selected, pressed, theme.colors.surface.card)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              size={13.5}
              weight="semibold"
              color={selected ? theme.colors.brand.primary : theme.colors.content.tertiary}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const SELECTED_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
  elevation: 2,
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9 },
})
