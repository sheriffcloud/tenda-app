import { useMemo, useState } from 'react'
import {
  SUPPORTED_PAYOUT_COUNTRIES,
  getPayoutSpec,
  type BankAccountSummary,
  type PayoutCountrySpec,
} from '@tenda/shared'
import { api } from '@/api/client'
import { ApiClientError } from '@tenda/shared'
import { showToast } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'
import type { PayoutFormValue } from '@/components/payout'

/** The user's country when it's a supported payout market, else the first one. */
export function defaultPayoutCountry(home: string | null): string {
  return home !== null && SUPPORTED_PAYOUT_COUNTRIES.includes(home)
    ? home
    : SUPPORTED_PAYOUT_COUNTRIES[0]
}

export interface AddPayoutAccountState {
  country: string
  setCountry: (country: string) => void
  /** The active country's payout spec (rails + fields), or null if unsupported. */
  spec: PayoutCountrySpec | null
  saving: boolean
  /**
   * Creates the account and returns it, or null on failure (a toast is shown).
   * The FIRST account a user saves is marked default. Callers auto-select the
   * returned account so it's immediately usable — no refetch race.
   */
  save: (value: PayoutFormValue) => Promise<BankAccountSummary | null>
}

/**
 * Add-payout-account orchestration shared by the settings screen and the
 * in-form PayoutAccountSelect dropdown — the single source of the country
 * default, spec lookup, and create call, so the two surfaces can never drift.
 *
 * @param isFirstAccount whether the caller currently has zero saved accounts
 *   (decides the default flag). Passed in because the account list lives with
 *   the caller (usePayoutAccounts / the settings screen).
 */
export function useAddPayoutAccount(isFirstAccount: boolean): AddPayoutAccountState {
  const homeCountry = useAuthStore((s) => s.user?.country ?? null)
  const [country, setCountry] = useState(() => defaultPayoutCountry(homeCountry))
  const [saving, setSaving] = useState(false)

  const spec = useMemo(() => getPayoutSpec(country), [country])

  async function save(value: PayoutFormValue): Promise<BankAccountSummary | null> {
    setSaving(true)
    try {
      const account = await api.fiat.createBankAccount({
        country,
        kind: value.kind,
        bank_code: value.bank_code.trim(),
        account_number: value.account_number.trim(),
        account_name: value.account_name.trim(),
        is_default: isFirstAccount,
      })
      showToast('success', 'Payout account saved')
      return account
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not save the account')
      return null
    } finally {
      setSaving(false)
    }
  }

  return { country, setCountry, spec, saving, save }
}
