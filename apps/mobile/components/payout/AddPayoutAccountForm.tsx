import { View, StyleSheet } from 'react-native'
import type { BankAccountSummary } from '@tenda/shared'
import { useAddPayoutAccount } from '@/hooks/useAddPayoutAccount'
import { CountrySelector } from './CountrySelector'
import { PayoutAccountForm, type PayoutFormValue } from './PayoutAccountForm'

/**
 * Country picker + spec-driven payout form, wired to useAddPayoutAccount. The
 * single add-account UI reused by the settings screen and the in-form
 * PayoutAccountSelect dropdown — country default, validation, and the create
 * call are all owned by the hook, so the two surfaces stay identical.
 *
 * Presentational only: the parent supplies the sheet/modal chrome and reacts to
 * onSaved (reload + auto-select the returned account).
 */
export function AddPayoutAccountForm({
  isFirstAccount,
  onSaved,
}: {
  isFirstAccount: boolean
  onSaved: (account: BankAccountSummary) => void
}) {
  const { country, setCountry, spec, saving, save } = useAddPayoutAccount(isFirstAccount)

  async function handleSubmit(value: PayoutFormValue) {
    const account = await save(value)
    if (account !== null) onSaved(account)
  }

  return (
    <View style={s.body}>
      <CountrySelector selected={country} onSelect={setCountry} />
      {spec !== null && <PayoutAccountForm spec={spec} saving={saving} onSubmit={handleSubmit} />}
    </View>
  )
}

const s = StyleSheet.create({
  body: { gap: 12 },
})
