'use client'

/**
 * Where the money lands (Tier-3 comp, lines 759-775).
 *
 * The comp offers a choice of RAILS — bank, card, mobile money — as if the
 * reader picks a transfer method. They do not: a payout account IS its rail
 * (`BankAccountSummary.kind`), chosen when the account was added and fixed by
 * the country's payout spec. So the aside lists the accounts they actually
 * have, and the rail is a fact printed on each rather than a control.
 *
 * Adding an account happens HERE, inline (spec-correction #50) — mobile's
 * PayoutAccountSelect opens its add form in a sheet on both sell tabs, and the
 * old link out to settings discarded the amount and rate the reader had typed
 * (it also pointed at a route that did not exist). With no accounts the form
 * IS the empty state: the only next step is adding one, so it is not put
 * behind a button. `onCreated` selects the new account and reloads the list.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CURRENCY_META, getPayoutRail, payoutCurrencyForCountry } from '@tenda/shared'
import type { BankAccountSummary } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'
import { PayoutAccountForm } from '@/components/payout/PayoutAccountForm'
import type { PayoutAccountsState } from '@/hooks/fiat/usePayoutAccounts'
import { SELL_COPY } from './copy'

/** The rail's own name where the country spec has one, else the raw kind. */
function railName(account: BankAccountSummary): string {
  return getPayoutRail(account.country, account.kind)?.label ?? account.kind
}

export function PayoutAccountAside({ payout }: { payout: PayoutAccountsState }) {
  const { accounts } = payout
  const [adding, setAdding] = useState(false)

  function handleCreated(row: BankAccountSummary) {
    payout.setSelectedId(row.id)
    payout.reload()
    setAdding(false)
  }

  return (
    <aside className="rounded-card border border-border-subtle bg-surface-inset p-4.5">
      <Eyebrow as="h2">{SELL_COPY.railLabel}</Eyebrow>

      {accounts === null ? (
        // Still loading. NOT the empty state: "add a payout account" to someone
        // who has three would be a lie with a button on it.
        <div aria-hidden className="mt-3 flex animate-shimmer flex-col gap-2">
          <div className="h-14 rounded-control bg-surface-card" />
          <div className="h-14 rounded-control bg-surface-card" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-5 text-content-secondary">{SELL_COPY.noPayout}</p>
          <PayoutAccountForm description={SELL_COPY.addFormNote} onCreated={handleCreated} />
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2" role="group" aria-label={SELL_COPY.railLabel}>
            {accounts.map((account) => {
              const selected = account.id === payout.selectedId
              const currency = payoutCurrencyForCountry(account.country)
              return (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => payout.setSelectedId(account.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-control border px-3.5 py-3 text-left transition-colors duration-(--motion-fast)',
                    selected
                      ? 'border-control-selected-border bg-control-selected-background'
                      : 'border-border-default bg-surface-card hover:border-border-strong',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-content-primary">
                      {account.account_name}
                    </span>
                    <span className="mt-0.5 block truncate font-numeric text-xs text-content-tertiary">
                      {railName(account)} · {account.account_number_masked}
                    </span>
                  </span>
                  {/* A retired market's saved account has no currency to
                      name — the row still lists (the user must see and manage
                      it) but the chip is omitted rather than guessed. */}
                  {currency !== null && (
                    <span className="shrink-0 font-numeric text-xs font-bold text-content-secondary">
                      {CURRENCY_META[currency].symbol} {currency}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline"
          >
            <Plus size={15} aria-hidden />
            {adding ? SELL_COPY.closeAddAccount : SELL_COPY.addAccount}
          </button>
          {adding && (
            <div className="mt-3">
              <PayoutAccountForm description={SELL_COPY.addFormNote} onCreated={handleCreated} />
            </div>
          )}
        </>
      )}

      <p className="mt-3.5 text-xs leading-4 text-content-tertiary">{SELL_COPY.railNote}</p>
    </aside>
  )
}
