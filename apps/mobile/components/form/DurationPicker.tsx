import { useState } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import { Text } from '@/components/ui/Text'
import { Chip } from '@/components/ui/Chip'

const PRESETS: { label: string; seconds: number }[] = [
  { label: '1d',  seconds: 86_400 },
  { label: '3d',  seconds: 259_200 },
  { label: '7d',  seconds: 604_800 },
  { label: '14d', seconds: 1_209_600 },
  { label: '30d', seconds: 2_592_000 },
]

interface DurationPickerProps {
  label?: string
  helper?: string
  value: number
  onChange: (seconds: number) => void
}

/**
 * Completion window picker, same chip-row anatomy as the Accept deadline
 * picker in GigForm: form-variant chips (40h R12 --card with --line border).
 * "Custom" chip reveals a small numeric input + day/hour unit toggle.
 */
export function DurationPicker({
  label = 'Completion window',
  helper = 'How long the worker has after accepting.',
  value,
  onChange,
}: DurationPickerProps) {
  const { theme } = useUnistyles()

  const isPreset = PRESETS.some((p) => p.seconds === value)
  const [customMode, setCustomMode] = useState(!isPreset && value > 0)
  const [customNum, setCustomNum] = useState(isPreset ? '' : String(Math.round(value / 86_400)))
  const [unit, setUnit] = useState<'hours' | 'days'>('days')

  function selectPreset(seconds: number) {
    setCustomMode(false)
    onChange(seconds)
  }

  function handleCustomChange(val: string) {
    setCustomNum(val)
    const n = parseInt(val, 10)
    if (n > 0) onChange(n * (unit === 'days' ? 86_400 : 3_600))
  }

  function toggleUnit() {
    const next = unit === 'days' ? 'hours' : 'days'
    setUnit(next)
    const n = parseInt(customNum, 10)
    if (n > 0) onChange(n * (next === 'days' ? 86_400 : 3_600))
  }

  return (
    <View style={s.wrap}>
      {label ? (
        <Text style={[s.label, { color: theme.colors.content.secondary }]}>{label}</Text>
      ) : null}
      {helper ? (
        <Text style={[s.helper, { color: theme.colors.content.tertiary }]}>{helper}</Text>
      ) : null}

      <View style={s.chipRow}>
        {PRESETS.map((p) => (
          <Chip
            key={p.seconds}
            label={p.label}
            variant="form"
            selected={!customMode && value === p.seconds}
            onPress={() => selectPreset(p.seconds)}
          />
        ))}
        <Chip
          label="Custom"
          variant="form"
          selected={customMode}
          onPress={() => setCustomMode(true)}
        />
      </View>

      {customMode && (
        <View style={s.customRow}>
          <TextInput
            value={customNum}
            onChangeText={handleCustomChange}
            keyboardType="numeric"
            placeholder="e.g. 10"
            placeholderTextColor={theme.colors.content.tertiary}
            style={[
              s.customInput,
              {
                backgroundColor: theme.colors.surface.card,
                borderColor: theme.colors.border.default,
                color: theme.colors.content.primary,
              },
            ]}
            maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
          />
          <Pressable
            onPress={toggleUnit}
            style={({ pressed }) => [
              s.unitBtn,
              {
                backgroundColor: theme.colors.brand.primarySurface,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel={`Toggle unit, currently ${unit}`}
            accessibilityRole="button"
          >
            <Text size={13} weight="semibold" color={theme.colors.brand.primary}>
              {unit}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  label: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: -0.06,
  },
  helper: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  customInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: typography.fonts.body.regular,
    fontSize: 14,
  },
  unitBtn: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
