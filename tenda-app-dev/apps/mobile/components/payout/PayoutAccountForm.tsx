import { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import type { PayoutCountrySpec, PayoutAccountInput, PayoutRailKind } from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { PayoutFieldRenderer } from './PayoutFieldRenderer'

const EMPTY: PayoutAccountInput = { bank_code: '', account_number: '', account_name: '' }

export interface PayoutFormValue extends PayoutAccountInput {
  kind: PayoutRailKind
}

/**
 * Spec-driven payout form for one country: a rail selector when the country
 * offers more than one (GH: bank + mobile money), then the active rail's
 * fields. Validation is the rail spec's own — the same rule the server runs —
 * so the button only fires a payload the server will accept.
 */
export function PayoutAccountForm({
  spec,
  saving,
  onSubmit,
}: {
  spec: PayoutCountrySpec
  saving: boolean
  onSubmit: (value: PayoutFormValue) => void
}) {
  const [kind, setKind] = useState<PayoutRailKind>(spec.rails[0].kind)
  const [values, setValues] = useState<PayoutAccountInput>(EMPTY)

  // A new country resets the rail + fields (its rails/fields differ).
  useEffect(() => {
    setKind(spec.rails[0].kind)
    setValues(EMPTY)
  }, [spec.country])

  const rail = useMemo(() => spec.rails.find((r) => r.kind === kind) ?? spec.rails[0], [spec, kind])
  const error = rail.validate(values)

  function switchRail(next: PayoutRailKind) {
    setKind(next)
    setValues(EMPTY) // fields differ per rail
  }

  return (
    <View style={s.form}>
      {spec.rails.length > 1 && (
        <View>
          <SectionLabel>Payout method</SectionLabel>
          <View style={s.chipRow}>
            {spec.rails.map((r) => (
              <Chip
                key={r.kind}
                label={r.label}
                variant="form"
                selected={kind === r.kind}
                onPress={() => switchRail(r.kind)}
              />
            ))}
          </View>
        </View>
      )}

      {rail.fields.map((field) => (
        <PayoutFieldRenderer
          key={field.column}
          field={field}
          value={values[field.column]}
          onChange={(next) => setValues((v) => ({ ...v, [field.column]: next }))}
        />
      ))}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={saving}
        disabled={error !== null}
        onPress={() => onSubmit({ ...values, kind })}
      >
        Save account
      </Button>
    </View>
  )
}

const s = StyleSheet.create({
  form: { gap: 12, paddingTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
})
