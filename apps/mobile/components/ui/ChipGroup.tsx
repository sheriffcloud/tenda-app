import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'
import { Chip } from './Chip'
import { SectionLabel } from './SectionLabel'

export interface ChipOption<T extends string | number> {
  label: string
  value: T
  /** Offered but not currently pickable (the Chip ignores presses). */
  disabled?: boolean
}

/**
 * A labelled row of form chips. Selection is entirely the caller's — this
 * component asks `isSelected` per option and reports presses, so the same
 * layout serves single-select (duration windows) and multi-select (proof
 * requirements) without a mode flag.
 */
export function ChipGroup<T extends string | number>({
  label,
  hint,
  options,
  isSelected,
  onPress,
}: {
  label: string
  hint?: string
  options: readonly ChipOption<T>[]
  isSelected: (value: T) => boolean
  onPress: (value: T) => void
}) {
  const { theme } = useUnistyles()
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      {hint !== undefined && (
        <Text style={[s.hint, { color: theme.colors.content.tertiary }]}>{hint}</Text>
      )}
      <View style={s.chipRow}>
        {options.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            variant="form"
            selected={isSelected(opt.value)}
            disabled={opt.disabled ?? false}
            onPress={() => onPress(opt.value)}
          />
        ))}
      </View>
    </>
  )
}

const s = StyleSheet.create({
  hint: { fontSize: 12.5, lineHeight: 17, paddingHorizontal: 20, paddingBottom: 8, marginTop: -4 },
  chipRow: { paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
