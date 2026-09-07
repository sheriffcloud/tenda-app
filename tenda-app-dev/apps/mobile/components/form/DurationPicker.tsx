import { useState } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import {
  DURATION_PRESETS,
  DURATION_UNIT_SECONDS,
  completionDurationProblem,
  customDurationToSeconds,
  durationRangeLabel,
  type DurationUnit,
} from '@tenda/shared'
import { Text } from '@/components/ui/Text'
import { Chip } from '@/components/ui/Chip'

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
 *
 * The presets and the seconds arithmetic are SHARED (`gig-duration`), not
 * written here: web had the same code and the same hole — a custom window
 * with no ceiling, so 91 days emitted a value the server refuses while the
 * field said nothing. The over-limit value is still emitted exactly as typed;
 * what changed is that the reader is told, here, what the window is.
 */
export function DurationPicker({
  label = 'Completion window',
  helper = 'How long the worker has after accepting.',
  value,
  onChange,
}: DurationPickerProps) {
  const { theme } = useUnistyles()

  const isPreset = DURATION_PRESETS.some((p) => p.seconds === value)
  // Seed from the value only when there IS a custom value. `String(Math.round(
  // 0 / 86400))` is '0', so an unset field opened pre-filled with a zero it
  // then objected to; and a custom window measured in HOURS rounded to '0'
  // days, which is what a resumed 6-hour draft used to display.
  const isCustom = !isPreset && value > 0
  const initialUnit: DurationUnit =
    isCustom && value % DURATION_UNIT_SECONDS.days !== 0 ? 'hours' : 'days'
  const [unit, setUnit] = useState<DurationUnit>(initialUnit)
  const [customNum, setCustomNum] = useState(
    isCustom ? String(Math.round(value / DURATION_UNIT_SECONDS[initialUnit])) : '',
  )
  const [customMode, setCustomMode] = useState(isCustom)
  // Only while the reader is in the custom field: a preset cannot be wrong,
  // and an untouched field should not be scolded before it is filled in.
  const problem = customMode && customNum !== '' ? completionDurationProblem(value) : null

  function selectPreset(seconds: number) {
    setCustomMode(false)
    onChange(seconds)
  }

  function handleCustomChange(val: string) {
    setCustomNum(val)
    const seconds = customDurationToSeconds(val, unit)
    if (seconds !== null) onChange(seconds)
  }

  function toggleUnit() {
    const next: DurationUnit = unit === 'days' ? 'hours' : 'days'
    setUnit(next)
    const seconds = customDurationToSeconds(customNum, next)
    if (seconds !== null) onChange(seconds)
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
        {DURATION_PRESETS.map((p) => (
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

      {customMode && (
        <Text
          size={12}
          color={problem === null ? theme.colors.content.tertiary : theme.colors.feedback.danger.text}
          accessibilityRole={problem === null ? undefined : 'alert'}
        >
          {problem ?? `Anything from ${durationRangeLabel()}.`}
        </Text>
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
