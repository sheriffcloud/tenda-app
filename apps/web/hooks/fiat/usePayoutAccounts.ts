'use client'

/**
 * Web port of apps/mobile/hooks/usePayoutAccounts.ts — the caller's saved
 * payout accounts, plus which one is selected.
 *
 * Two behaviours carry over because both were bugs once:
 *   - `accounts` is null while the first load is pending and `[]` only once it
 *     has answered, so "you have no payout account" is never shown to someone
 *     whose list simply has not arrived;
 *   - a selection SURVIVES a reload while the chosen account still exists, and
 *     otherwise falls back to the default (or first) — a deletion elsewhere
 *     must not leave a dangling id pointing at nothing.
 *
 * Mobile refetches on screen FOCUS so an account added on the bank-accounts
 * screen appears on return. A Next route unmounts on navigation, so here the
 * equivalent is mount — with `reload` exposed for the same in-place refresh
 * after adding one.
 */
import { useCallback, useEffect, useState } from 'react'
import type { BankAccountSummary } from '@tenda/shared'
import { api } from '@/api/client'

export interface PayoutAccountsState {
  /** null while the first load is pending; [] once loaded-but-empty. */
  accounts: BankAccountSummary[] | null
  selectedId: string | null
  setSelectedId: (id: string) => void
  /** The currently-selected account row, or null. */
  selected: BankAccountSummary | null
  reload: () => void
}

export function usePayoutAccounts(): PayoutAccountsState {
  const [accounts, setAccounts] = useState<BankAccountSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reload = useCallback(() => {
    api.fiat
      .bankAccounts()
      .then((rows) => {
        setAccounts(rows)
        setSelectedId((cur) =>
          cur !== null && rows.some((r) => r.id === cur)
            ? cur
            : (rows.find((r) => r.is_default)?.id ?? rows[0]?.id ?? null),
        )
      })
      // A failed read answers `[]`, not null: the surface then offers "add a
      // payout account" rather than spinning forever on a list that will not
      // arrive. Adding one re-runs this.
      .catch(() => setAccounts([]))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const selected = accounts?.find((a) => a.id === selectedId) ?? null
  return { accounts, selectedId, setSelectedId, selected, reload }
}
