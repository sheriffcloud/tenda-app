import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from '@/api/client'
import type { BankAccountSummary } from '@tenda/shared'

export interface PayoutAccountsState {
  /** null while the first load is pending; [] once loaded-but-empty. */
  accounts: BankAccountSummary[] | null
  selectedId: string | null
  setSelectedId: (id: string) => void
  /** The currently-selected account row, or null. */
  selected: BankAccountSummary | null
  reload: () => void
}

/**
 * Loads the caller's saved payout accounts and tracks a selection. Refetches
 * on screen FOCUS (not just mount) so a payout account added on the
 * bank-accounts screen shows up the instant you return — fixing the stale
 * list on the sell / create-offer flows.
 *
 * Selection survives a refetch when the chosen account still exists; otherwise
 * it falls back to the default (or first) account, so a deletion elsewhere
 * can't leave a dangling selection.
 */
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
      .catch(() => setAccounts([]))
  }, [])

  useFocusEffect(useCallback(() => { reload() }, [reload]))

  const selected = accounts?.find((a) => a.id === selectedId) ?? null
  return { accounts, selectedId, setSelectedId, selected, reload }
}
