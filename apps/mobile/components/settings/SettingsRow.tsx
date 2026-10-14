import type { ReactNode } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ChevronRight } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

/** Rounded card that groups settings rows (shared by every section). */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const { theme } = useUnistyles()
  return (
    <View
      style={[s.group, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}
    >
      {children}
    </View>
  )
}

interface SettingsRowProps {
  /** Pre-coloured icon element (or flag Text), rendered inside the inset tile. */
  icon: ReactNode
  label: string
  /** Optional right-aligned mono value (e.g. "NGN · ₦"). */
  value?: string
  onPress?: () => void
  showChevron?: boolean
  /** Trailing control (e.g. a Switch), mutually exclusive with chevron in practice. */
  trailing?: ReactNode
}

/** One settings row: inset icon tile, label, optional value / trailing / chevron. */
export function SettingsRow({ icon, label, value, onPress, showChevron, trailing }: SettingsRowProps) {
  const { theme } = useUnistyles()
  const body = (
    <>
      <View style={[s.rowIc, { backgroundColor: theme.colors.surface.inset }]}>{icon}</View>
      <Text style={[s.rowLabel, { color: theme.colors.content.primary }]} numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? (
        <Text style={[s.rowValue, { color: theme.colors.content.tertiary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        <View style={s.spacer} />
      )}
      {trailing}
      {showChevron === true && <ChevronRight size={16} color={theme.colors.content.tertiary} />}
    </>
  )
  if (onPress === undefined) return <View style={s.row}>{body}</View>
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: theme.colors.surface.pressed }]}
    >
      {body}
    </Pressable>
  )
}

const s = StyleSheet.create({
  group: { marginHorizontal: 20, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIc: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, letterSpacing: -0.075, flexShrink: 1 },
  rowValue: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 13,
    letterSpacing: 0.13,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  spacer: { flex: 1 },
})
