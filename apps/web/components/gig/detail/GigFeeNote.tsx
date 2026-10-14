'use client'

import { formatAssetAmount } from '@tenda/shared'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { GIG_DETAIL_COPY } from './copy'

export function GigFeeNote({ isSeeker, amountRaw, asset }: { isSeeker: boolean; amountRaw: string; asset: string }) {
  const { netRaw, feePct } = useEscrowFee(isSeeker, amountRaw)
  return (
    <p className="mt-2.5 type-body-small text-content-secondary">
      {/* The breakdown is all-null until config loads — the feePct check is
          type narrowing for the same load, never a second state. */}
      {netRaw === null || feePct === null
        ? GIG_DETAIL_COPY.feePending
        : GIG_DETAIL_COPY.workerReceives(formatAssetAmount(netRaw.toString(), asset), feePct)}
    </p>
  )
}
