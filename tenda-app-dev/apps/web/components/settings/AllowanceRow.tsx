'use client'

/**
 * One (chain × ERC-20 token) standing approval to the escrow contract —
 * web twin of mobile's components/settings/AllowanceRow. Presentational;
 * the panel owns reads/writes and confirmation.
 */
import { Button } from '@/components/ui/Button'

export interface AllowanceRowData {
  chainId: string
  chainName: string
  assetId: string
  symbol: string
  decimals: number
  token: string
  spender: string
  /** Base units; null while loading, 'error' when the read failed. */
  allowanceRaw: string | null | 'error'
}

/** Max-uint-style approvals (other dapps grant 2^256−1) read as unlimited. */
const UNLIMITED_THRESHOLD = BigInt(2) ** BigInt(255)

export function formatAllowance(row: AllowanceRowData): string {
  if (row.allowanceRaw === null) return 'Loading…'
  if (row.allowanceRaw === 'error') return 'Unavailable'
  if (row.allowanceRaw === '0') return 'No standing approval'
  const raw = BigInt(row.allowanceRaw)
  if (raw >= UNLIMITED_THRESHOLD) return `Unlimited ${row.symbol}`
  // Exact BigInt split, float division misrounds above 2^53 base units.
  const scale = BigInt(10) ** BigInt(row.decimals)
  const whole = raw / scale
  const frac = (raw % scale).toString().padStart(row.decimals, '0').replace(/0+$/, '')
  const wholeStr =
    whole <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(whole).toLocaleString() : whole.toString()
  return `${wholeStr}${frac === '' ? '' : `.${frac}`} ${row.symbol}`
}

interface Props {
  row: AllowanceRowData
  busy: boolean
  onSet: (row: AllowanceRowData) => void
  onRevoke: (row: AllowanceRowData) => void
}

export function AllowanceRow({ row, busy, onSet, onRevoke }: Props) {
  const hasAllowance = row.allowanceRaw !== null && row.allowanceRaw !== 'error' && row.allowanceRaw !== '0'
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content-primary">
          {row.symbol} · {row.chainName}
        </p>
        <p className="text-xs text-content-secondary">{formatAllowance(row)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="md" disabled={busy} onClick={() => onSet(row)}>
          Set
        </Button>
        {hasAllowance && (
          <Button
            variant="outline"
            size="md"
            disabled={busy}
            className="border-feedback-danger-base/50 text-feedback-danger-base hover:border-feedback-danger-base hover:text-feedback-danger-base"
            onClick={() => onRevoke(row)}
          >
            Revoke
          </Button>
        )}
      </div>
    </li>
  )
}
