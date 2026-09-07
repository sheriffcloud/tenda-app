import { formatAssetAmount, type DossierTransaction } from '@tenda/shared'
import { formatAdminDateTime } from '@/lib/date-format'

/**
 * On-chain transaction history as a vertical timeline (oldest first). Each
 * row is a settled escrow event — the record of what actually happened,
 * which the mediator weighs against the parties' claims.
 */
export function StatusTimeline({
  transactions,
  asset,
}: {
  transactions: DossierTransaction[]
  asset: string
}) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No on-chain transactions yet.</p>
  }
  return (
    <ol className="space-y-2">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium capitalize">{t.type.replace(/_/g, ' ')}</span>
          <span className="text-muted-foreground">
            {t.amount_raw !== null && `${formatAssetAmount(t.amount_raw, asset)} · `}
            {formatAdminDateTime(t.created_at)}
          </span>
        </li>
      ))}
    </ol>
  )
}
