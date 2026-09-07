import { RECEIPTS } from './content'

/**
 * Three honest pre-launch receipts. Replaces the wireframe's
 * `1.7s · 1.5% · 0.4%` triple — those numbers were placeholders without
 * a public stats endpoint. The three here are immutable protocol facts +
 * platform guarantees.
 */
export function ReceiptsStrip() {
  return (
    <div className="grid divide-y divide-[var(--border-subtle)] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {RECEIPTS.map((r) => (
        <div key={r.k} className="flex flex-col gap-1.5 px-5 py-5">
          <p className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
            {r.k}
          </p>
          <p className="mono-large text-[var(--content-primary)]">
            <span className="text-[var(--brand)]">{r.v}</span>
            {r.unit && (
              <span className="mono-sm ml-1 text-[var(--content-tertiary)]">{r.unit}</span>
            )}
          </p>
          <p className="body-sm text-[var(--content-secondary)]">{r.b}</p>
        </div>
      ))}
    </div>
  )
}
