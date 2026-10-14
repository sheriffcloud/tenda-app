'use client'

/**
 * The approval-mode client actions — web port of mobile's useApplications
 * (screen-local by design; none of these returns an unsigned tx, so they do
 * not belong in the escrow store).
 */
import { useCallback, useState } from 'react'
import {
  APPLICATION_STATUSES,
  APPLY_SUCCESS,
  RELEASE_SUCCESS,
  WITHDRAW_SUCCESS,
  isTakedownRefusal,
  ApiClientError,
  type GigApplicant,
} from '@tenda/shared'
import { api } from '@/api/client'
import { showToast } from '@/components/ui/Toast'

/** Which shortlist rows the poster is looking at. */
export type ApplicantFilter = 'open' | 'all'

interface UseApplicationsArgs {
  /** Called after any action that changes what the caller is displaying. */
  onChanged?: () => void
}

/**
 * The server's application errors are all deliberately worded for the person
 * reading them, so its message beats anything invented here.
 */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError && error.message !== '') return error.message
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

/**
 * The escrow id is an ARGUMENT to each action, not a hook parameter: the gig
 * detail acts on one gig, but the My Applications list acts on a different
 * one per row.
 */
export function useApplications({ onChanged }: UseApplicationsArgs = {}) {
  const [busy, setBusy] = useState(false)

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
        // caller should be displaying: re-read so Apply stops being offered.
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
     * escrow — only the poster's `unassign` does.
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
      // Omitting `status` asks the server for its own live default; "All"
      // passes the SHARED tuple so a new status cannot quietly stop showing.
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
