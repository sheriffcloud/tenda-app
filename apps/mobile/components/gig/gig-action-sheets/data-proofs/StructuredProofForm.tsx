import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  structuredValuesProblem,
  type StructuredProofField,
  type StructuredProofValue,
} from '@tenda/shared'
import { spacing } from '@/theme/tokens'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Text'

/**
 * The raw form state → the values a structured payload would carry. A number
 * field's unparseable text is passed through AS the string so the shared
 * conformance check names the real problem ("must be a number") instead of
 * claiming the field is missing; the entry is only reported upward once the
 * whole set conforms, so a mis-typed number can never be submitted.
 */
export function structuredFormValues(
  fields: readonly StructuredProofField[],
  texts: Record<string, string>,
  bools: Record<string, boolean>,
): Record<string, StructuredProofValue> {
  // Tuples materialised with Object.fromEntries, never `obj[name] = v`: a
  // field named "__proto__" would hit the prototype SETTER under assignment
  // and its answer would silently vanish (the #14 payload finding, client side).
  const entries: [string, StructuredProofValue][] = []
  for (const field of fields) {
    if (field.kind === 'boolean') {
      if (Object.hasOwn(bools, field.name)) entries.push([field.name, bools[field.name] as boolean])
      continue
    }
    const raw = (Object.hasOwn(texts, field.name) ? (texts[field.name] as string) : '').trim()
    if (raw === '') continue
    if (field.kind === 'number') {
      const parsed = Number(raw)
      entries.push([field.name, Number.isFinite(parsed) ? parsed : raw])
    } else {
      entries.push([field.name, raw])
    }
  }
  return Object.fromEntries(entries)
}

/**
 * The worker's answers to a gig's declared structured fields. Reports the
 * whole value set upward only while it CONFORMS (shared check) — otherwise
 * null, which keeps the requirement unmet in the sheet's checklist.
 */
export function StructuredProofForm({
  fields,
  onChange,
}: {
  fields: readonly StructuredProofField[]
  onChange: (values: Record<string, StructuredProofValue> | null) => void
}) {
  const { theme } = useUnistyles()
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [bools, setBools] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)

  function report(nextTexts: Record<string, string>, nextBools: Record<string, boolean>) {
    const values = structuredFormValues(fields, nextTexts, nextBools)
    onChange(structuredValuesProblem(fields, values) === null ? values : null)
  }

  const values = structuredFormValues(fields, texts, bools)
  const problem = structuredValuesProblem(fields, values)

  return (
    <View style={s.wrap}>
      {fields.map((field) => (
        <View key={field.name} style={s.field}>
          {field.kind === 'boolean' ? (
            <>
              <Text variant="caption" weight="semibold">
                {field.name}
                {field.required ? '' : ' (optional)'}
              </Text>
              <View style={s.chipRow}>
                {[true, false].map((answer) => (
                  <Chip
                    key={String(answer)}
                    label={answer ? 'Yes' : 'No'}
                    variant="form"
                    selected={Object.hasOwn(bools, field.name) && bools[field.name] === answer}
                    onPress={() => {
                      setTouched(true)
                      const next = { ...bools, [field.name]: answer }
                      setBools(next)
                      report(texts, next)
                    }}
                  />
                ))}
              </View>
            </>
          ) : (
            <Input
              label={field.required ? field.name : `${field.name} (optional)`}
              value={Object.hasOwn(texts, field.name) ? texts[field.name] : ''}
              keyboardType={field.kind === 'number' ? 'numeric' : 'default'}
              onChangeText={(text) => {
                setTouched(true)
                const next = { ...texts, [field.name]: text }
                setTexts(next)
                report(next, bools)
              }}
            />
          )}
        </View>
      ))}
      {touched && problem !== null && (
        <Text variant="caption" color={theme.colors.feedback.warning.base}>
          {problem}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: { gap: 6 },
  chipRow: { flexDirection: 'row', gap: 8 },
})
