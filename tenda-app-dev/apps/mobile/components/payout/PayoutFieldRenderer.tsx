import { View, StyleSheet } from 'react-native'
import type { PayoutFieldSpec } from '@tenda/shared'
import { Input } from '@/components/ui/Input'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'

/**
 * Renders one payout field from its spec: a Chip select when the field carries
 * `options` (e.g. the GH mobile-money network), a text Input otherwise. Purely
 * presentational — value + change are owned by the form.
 */
export function PayoutFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: PayoutFieldSpec
  value: string
  onChange: (next: string) => void
}) {
  if (field.options !== undefined) {
    return (
      <View>
        <SectionLabel>{field.label}</SectionLabel>
        <View style={s.chipRow}>
          {field.options.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              variant="form"
              selected={value === opt.value}
              onPress={() => onChange(opt.value)}
            />
          ))}
        </View>
      </View>
    )
  }

  return (
    <Input
      label={field.label}
      placeholder={field.placeholder}
      value={value}
      onChangeText={onChange}
      keyboardType={field.keyboard === 'numeric' ? 'numeric' : 'default'}
      autoCapitalize={field.autoCapitalize ?? 'none'}
      maxLength={field.maxLength}
    />
  )
}

const s = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
})
