'use client'

import { useState } from 'react'
import {
  PAYOUT_COUNTRY_SPECS,
  SUPPORTED_PAYOUT_COUNTRIES,
  getPayoutSpec,
  type BankAccountSummary,
  type PayoutAccountInput,
  type PayoutRailSpec,
} from '@tenda/shared'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { showToast } from '@/components/ui/Toast'

const EMPTY_INPUT: PayoutAccountInput = { bank_code: '', account_number: '', account_name: '' }

export function PayoutAccountForm({
  onCreated,
  description = 'Save a verified destination for fiat payouts.',
}: {
  onCreated: (row: BankAccountSummary) => void
  description?: string
}) {
  const [country, setCountry] = useState<string>(SUPPORTED_PAYOUT_COUNTRIES[0])
  const spec = getPayoutSpec(country)
  const [railKind, setRailKind] = useState<string | null>(null)
  const rail: PayoutRailSpec | null = spec === null
    ? null
    : (spec.rails.find((candidate) => candidate.kind === railKind) ?? spec.rails[0])
  const [input, setInput] = useState<PayoutAccountInput>(EMPTY_INPUT)
  const [saving, setSaving] = useState(false)

  function reset(nextCountry?: string, nextRail?: string) {
    if (nextCountry !== undefined) setCountry(nextCountry)
    setRailKind(nextRail ?? null)
    setInput(EMPTY_INPUT)
  }

  async function handleAdd() {
    if (rail === null || saving) return
    const invalid = rail.validate(input)
    if (invalid !== null) {
      showToast('error', invalid)
      return
    }
    setSaving(true)
    try {
      const row = await api.fiat.createBankAccount({ country, kind: rail.kind, ...input })
      setInput(EMPTY_INPUT)
      onCreated(row)
      showToast('success', 'Payout account added')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not add the account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-content-primary">Add a payout account</h2>
        <p className="mt-1 text-sm text-content-secondary">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Country">
        {SUPPORTED_PAYOUT_COUNTRIES.map((code) => (
          <Chip key={code} label={`${PAYOUT_COUNTRY_SPECS[code].flag} ${PAYOUT_COUNTRY_SPECS[code].countryName}`} selected={country === code} onClick={() => reset(code)} />
        ))}
      </div>
      {spec !== null && spec.rails.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Payout rail">
          {spec.rails.map((candidate) => (
            <Chip key={candidate.kind} label={candidate.label} selected={rail?.kind === candidate.kind} onClick={() => reset(undefined, candidate.kind)} />
          ))}
        </div>
      )}
      {rail?.fields.map((field) => (
        <label key={field.column} className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-content-primary">{field.label}</span>
          {field.options !== undefined ? (
            <select value={input[field.column]} onChange={(event) => setInput((current) => ({ ...current, [field.column]: event.target.value }))} className="rounded-control border border-border-input bg-control-input-background p-3 text-control-input-text outline-none focus:border-border-input-active">
              <option value="">{field.placeholder}</option>
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <input value={input[field.column]} onChange={(event) => setInput((current) => ({ ...current, [field.column]: event.target.value }))} inputMode={field.keyboard === 'numeric' ? 'numeric' : 'text'} maxLength={field.maxLength} placeholder={field.placeholder} className="rounded-control border border-border-input bg-control-input-background p-3 text-control-input-text outline-none focus:border-border-input-active" />
          )}
        </label>
      ))}
      <Button disabled={saving} onClick={() => void handleAdd()}>{saving ? 'Adding…' : 'Add account'}</Button>
    </section>
  )
}
