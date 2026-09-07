'use client'

/**
 * Claim / release buttons (#91) — surfaces the server's CO7 semantics:
 * claim races lose with 409 DISPUTE_ALREADY_CLAIMED (atomic UPDATE on the
 * server), resolved disputes 409 DISPUTE_RESOLVED, release is idempotent
 * (claimer or super_admin). onChanged lets the caller refetch.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

interface ClaimActionsProps {
  disputeId: string
  assignedToId: string | null
  resolved: boolean
  /** Current session user id (claim ownership). */
  meId: string
  onChanged: () => void
}

export function ClaimActions({ disputeId, assignedToId, resolved, meId, onChanged }: ClaimActionsProps) {
  const [busy, setBusy] = useState(false)
  if (resolved) return null

  const mine = assignedToId === meId
  const claimedByOther = assignedToId !== null && !mine

  async function run(action: 'claim' | 'release') {
    setBusy(true)
    try {
      await (action === 'claim' ? adminApi.disputes.claim(disputeId) : adminApi.disputes.release(disputeId))
      toast.success(action === 'claim' ? 'Dispute claimed' : 'Returned to the pool')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DISPUTE_ALREADY_CLAIMED') {
        toast.error('Another mediator claimed this dispute first')
      } else if (err instanceof ApiError && err.code === 'DISPUTE_RESOLVED') {
        toast.error('Dispute is already resolved')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Action failed')
      }
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  if (mine) {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run('release')}>
        Release
      </Button>
    )
  }
  return (
    <Button size="sm" disabled={busy || claimedByOther} onClick={() => run('claim')}>
      {claimedByOther ? 'Claimed' : 'Claim'}
    </Button>
  )
}
