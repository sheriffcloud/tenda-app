'use client'

/**
 * Payout accounts — web port of mobile's bank-accounts settings over the
 * SHARED payout registry (NG/KE/GH country specs, per-rail fields and
 * validation — never re-encoded here). Add renders the spec's fields;
 * delete confirms through ConfirmDialog.
 */
import { useEffect, useState } from 'react'
import { Landmark, Smartphone, Trash2 } from 'lucide-react'
import { type BankAccountSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { showToast } from '@/components/ui/Toast'
import { PayoutAccountForm } from '@/components/payout/PayoutAccountForm'

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccountSummary[] | null>(null)
  const [deleting, setDeleting] = useState<BankAccountSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.fiat
      .bankAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  async function confirmDelete() {
    if (deleting === null) return
    setBusy(true)
    try {
      await api.fiat.deleteBankAccount({ id: deleting.id })
      setAccounts((prev) => (prev === null ? prev : prev.filter((r) => r.id !== deleting.id)))
      setDeleting(null)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not remove the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="pt-1 font-display text-2xl font-bold text-content-primary">Payout accounts</h1>

      {accounts === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-content-secondary">
          No payout accounts yet. Buyers pay your fiat into the account you attach to an offer.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3"
            >
              {row.kind === 'mobile_money' ? (
                <Smartphone size={16} className="shrink-0 text-content-secondary" />
              ) : (
                <Landmark size={16} className="shrink-0 text-content-secondary" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-content-primary">
                  {row.account_name}
                  {row.is_default && <span className="ml-2 text-xs text-brand-primary">Default</span>}
                </span>
                <span className="font-numeric text-xs text-content-secondary">
                  {row.country} · {row.bank_code} · {row.account_number_masked}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${row.account_name}`}
                onClick={() => setDeleting(row)}
                className="flex h-9 w-9 items-center justify-center rounded-control text-content-tertiary transition-colors hover:bg-surface-inset hover:text-feedback-danger-base"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PayoutAccountForm onCreated={(row) => setAccounts((prev) => [...(prev ?? []), row])} />

      <ConfirmDialog
        open={deleting !== null}
        title="Remove payout account"
        message={deleting !== null ? `Remove ${deleting.account_name} (${deleting.account_number_masked})?` : undefined}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
