'use client'

/**
 * A framed numeric field with a unit on one side — the amount to sell, and the
 * rate to sell it at.
 *
 * Both wear the same ten utilities and the same 26px tabular figure, and they
 * carried them twice: a border token or a focus rule changed on one would have
 * silently left the other behind. The only real difference is which SIDE the
 * unit sits on — a currency symbol leads its figure, a ticker follows it — so
 * that is the prop.
 */
import type { ReactNode } from 'react'

export function MoneyField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  note,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  /** Leads the figure — a currency symbol. */
  prefix?: string
  /** Follows the figure — an asset ticker. */
  suffix?: string
  note?: ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block type-body-small font-semibold text-content-secondary"
      >
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2 rounded-control border border-border-input bg-surface-card px-4 py-3 focus-within:border-border-input-active">
        {prefix !== undefined && (
          <span className="shrink-0 type-mono font-semibold text-content-tertiary">
            {prefix}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="min-w-0 flex-1 bg-transparent font-numeric text-[26px] font-bold leading-8 text-content-primary outline-none placeholder:text-content-tertiary"
        />
        {suffix !== undefined && (
          <span className="shrink-0 type-mono font-semibold text-content-tertiary">
            {suffix}
          </span>
        )}
      </div>
      {note !== undefined && (
        <p className="mt-1.5 text-xs leading-4 text-content-tertiary">{note}</p>
      )}
    </div>
  )
}
