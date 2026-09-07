/**
 * The approval-mode client actions, screen-local by design.
 *
 * Deliberately NOT a store. `gigs.store` is display-only (its own docblock says
 * so: transitions go through the escrow store plus wallet dispatch), and none
 * of these actions returns an unsigned tx, so they do not belong in a store
 * whose contract is `request* → UnsignedTx`. Following `useHomeFeed`, the
 * poster's shortlist is a screen-local paginated list instead of global state.
 */

import { useCallback, useState } from 'react'
import { APPLICATION_STATUSES, type GigApplicant, ApiClientError } from '@tenda/shared'
import { api } from '@/api/client'
import { isTakedownRefusal } from '@tenda/shared'
import { showToast } from '@/components/ui'
import { APPLY_SUCCESS, RELEASE_SUCCESS, WITHDRAW_SUCCESS } from '@tenda/shared'

/** Which shortlist rows the poster is looking at. */
export type ApplicantFilter = 'open' | 'all'

interface UseApplicationsArgs {
  /** Called after any action that changes what the caller is displaying. */
  onChanged?: () => void
}

/**
 * Turns an API failure into a message worth showing.
 *
 * The server's application errors are all deliberately worded for the person
 * reading them (capacity, expiry, wrong status), so its message beats anything
 * invented here; the fallback only covers a transport failure with none.
 */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError && error.message !== '') return error.message
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

/**
 * The escrow id is an ARGUMENT to each action, not a hook parameter: the gig
 * detail acts on one gig, but the My Applications list acts on a different one
 * per row, and binding it at the hook would have forced that screen to
 * duplicate the toast-and-refresh handling.
 */
export function useApplications({ onChanged }: UseApplicationsArgs = {}) {
  const [busy, setBusy] = useState(false)

  /** Runs one action, reporting success or the server's own explanation. */
  const run = useCallback(
    async (action: () => Promise<unknown>, success: string, fallback: string) => {
      setBusy(true)
      try {
        await action()
        showToast('success', success)
        onChanged?.()
        return true
      } catch (e) {
        showToast('error', messageOf(e, fallback))
        // A takedown refusal is the one FAILURE that still changes what the
        // caller should be displaying: the gig was pulled while this screen was
        // open, so Apply must stop being offered. Re-read for it exactly as a
        // success does — every other failure leaves the screen alone, because
        // nothing about the gig changed.
        if (isTakedownRefusal(e)) onChanged?.()
        return false
      } finally {
        setBusy(false)
      }
    },
    [onChanged],
  )

  return {
    busy,
    /** `walletAddress` = the wallet to work under (the assign bakes it); the
     *  server validates it as one of the caller's verified wallets. */
    apply: (escrowId: string, message: string | null, walletAddress: string) =>
      run(
        () =>
          api.gigs.apply(
            { id: escrowId },
            { wallet_address: walletAddress, ...(message === null ? {} : { message }) },
          ),
        APPLY_SUCCESS,
        'Could not send your application, please try again.',
      ),
    withdraw: (escrowId: string) =>
      run(
        () => api.gigs.withdrawApplication({ id: escrowId }),
        WITHDRAW_SUCCESS,
        'Could not withdraw your application, please try again.',
      ),
    /**
     * The assigned worker's off-chain "not available". It does NOT move the
     * escrow — only the poster's `unassign` does — so the toast says the
     * poster was told rather than claiming the gig is free.
     */
    release: (escrowId: string) =>
      run(
        () => api.escrows.release({ id: escrowId }),
        RELEASE_SUCCESS,
        'Could not send that, please try again.',
      ),
  }
}

/** Loader for the poster's shortlist; the screen owns the rows. */
export function useApplicantList(escrowId: string, filter: ApplicantFilter) {
  const [applicants, setApplicants] = useState<GigApplicant[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      // Omitting `status` asks the server for its own live default, so the
      // "which statuses count as live" rule stays on one side of the wire.
      // "All" passes the SHARED tuple — serialised CSV by the query builder,
      // exactly like GigListQuery.status — so a new status cannot quietly stop
      // being shown, and a wrong one is a compile error rather than a 400.
      const { data } = await api.gigs.applicants(
        { id: escrowId },
        filter === 'all' ? { status: [...APPLICATION_STATUSES] } : undefined,
      )
      setApplicants(data)
    } catch (e) {
      setApplicants([])
      setError(messageOf(e, 'Could not load applicants.'))
    }
  }, [escrowId, filter])

  return { applicants, error, load }
}
