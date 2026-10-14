import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { X } from 'lucide-react-native'
import {
  MAX_STRUCTURED_FIELDS,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
  STRUCTURED_FIELD_KINDS,
  STRUCTURED_FIELD_KIND_LABEL,
  emptyStructuredFieldDraft,
  type StructuredFieldDraft,
} from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Text'

/**
 * The structured requirement's params: the fields the worker must report,
 * each a name + kind + whether it may be skipped. Validation (names, caps,
 * duplicates) lives in the shared proofSetupProblem; this only edits rows.
 */
export function StructuredFieldsEditor({
  fields,
  onChange,
}: {
  fields: StructuredFieldDraft[]
  onChange: (fields: StructuredFieldDraft[]) => void
}) {
  const { theme } = useUnistyles()

  function patch(index: number, over: Partial<StructuredFieldDraft>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...over } : field)))
  }

  return (
    <View style={s.wrap}>
      <Text variant="caption" weight="semibold">
        Fields the worker reports
      </Text>
      {fields.map((field, index) => (
        <View
          key={index}
          style={[
            s.row,
            {
              backgroundColor: theme.colors.surface.card,
              borderColor: theme.colors.border.subtle,
            },
          ]}
        >
          <View style={s.rowHead}>
            <View style={s.name}>
              <Input
                label={`Field ${index + 1}`}
                placeholder="e.g. Packages delivered"
                value={field.name}
                maxLength={MAX_STRUCTURED_FIELD_NAME_LENGTH}
                onChangeText={(name) => patch(index, { name })}
              />
            </View>
            <Pressable
              onPress={() => onChange(fields.filter((_, i) => i !== index))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove field ${index + 1}`}
            >
              <X size={18} color={theme.colors.content.tertiary} />
            </Pressable>
          </View>
          <View style={s.chipRow}>
            {STRUCTURED_FIELD_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={STRUCTURED_FIELD_KIND_LABEL[kind]}
                variant="form"
                selected={field.kind === kind}
                onPress={() => patch(index, { kind })}
              />
            ))}
            <Chip
              label={field.required ? 'Required' : 'Optional'}
              variant="form"
              selected={field.required}
              onPress={() => patch(index, { required: !field.required })}
            />
          </View>
        </View>
      ))}
      <Button
        variant="secondary"
        size="md"
        disabled={fields.length >= MAX_STRUCTURED_FIELDS}
        onPress={() => onChange([...fields, emptyStructuredFieldDraft()])}
      >
        Add field
      </Button>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: spacing.sm },
  row: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
