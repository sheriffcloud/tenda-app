'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { winnerLabel, type EscrowKind, type ResolutionWinner } from '@tenda/shared'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

const WINNERS: ResolutionWinner[] = ['creator', 'counterparty', 'split']

/**
 * Records a verdict → a pending proposal. No on-chain effect: a key-holder
 * signs it later. Shown only to the mediator holding the claim.
 */
export function ProposeForm({
  disputeId,
  kind,
  onProposed,
}: {
  disputeId: string
  kind: EscrowKind
  onProposed: () => void
}) {
  const [winner, setWinner] = useState<ResolutionWinner>('creator')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await adminApi.disputes.propose(disputeId, winner)
      toast.success('Resolution proposed — awaiting signature')
      onProposed()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not propose a resolution')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Record the outcome. A key-holder signs it on-chain to release the funds.
      </p>
      <div className="flex gap-2">
        <NativeSelect
          value={winner}
          onChange={(e) => setWinner(WINNERS.find((w) => w === e.target.value) ?? 'creator')}
          disabled={busy}
          className="flex-1"
        >
          {WINNERS.map((w) => (
            <option key={w} value={w}>
              {winnerLabel(kind, w)}
            </option>
          ))}
        </NativeSelect>
        <Button onClick={submit} disabled={busy}>
          Propose
        </Button>
      </div>
    </div>
  )
}
