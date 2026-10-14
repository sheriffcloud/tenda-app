/**
 * The gas claim as ONE renderer a host hands to its chain rows.
 *
 * This is the whole public surface of the feature on mobile now. A host writes:
 *
 *   const renderGasChip = useGasClaimChip({ enabled: section === 'ready' })
 *   <WalletBalanceRows balances={balances} renderChainAction={renderGasChip} />
 *
 * — one import, one hook call, one prop. Everything else (what to fetch, which
 * chains may be offered, what the chip says, what happens when a claim fails)
 * lives in this directory, which is what keeps the feature removable: see
 * ./index.ts.
 *
 * WHY THE HOOK OWNS THE FETCH rather than each chip fetching for itself: there
 * is one availability read for the whole screen, and per-chip reads would mean
 * N requests that can disagree the moment one of them claims — one row showing
 * "on its way" while its neighbour still offers the grant.
 */

import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { showToast } from '@/components/ui'
import { GasClaimChip } from './GasClaimChip'
import { gasClaimForChain, useGasClaim, type UseGasClaimOptions } from './useGasClaim'

/**
 * A renderer for one chain's claim affordance: the chip, or null.
 *
 * Returns null for every chain that is not claimable RIGHT NOW — no grant on
 * offer, already claimed, in flight, phone unverified, hot wallet empty. Those
 * are not silences by omission; they are the design. A refusal is an answer to a
 * tap, not a permanent notice on someone's balance screen.
 *
 * `enabled` exists because a renderer hook cannot be called conditionally: the
 * host calls it above its own section branch, so without it the offer is read on
 * every state including ones with no rows to put a chip on.
 */
export function useGasClaimChip(
  options: UseGasClaimOptions = {},
): (chain_id: string) => ReactNode {
  const { chains, claiming, claim } = useGasClaim(options)

  // A failed claim has to say something, and with no card on screen there is
  // nowhere for it to sit. A toast is the repo's convention for exactly this —
  // fire-and-forget feedback with no decision attached — and the message is
  // already human-readable: `useGasClaim` prefers the server's own sentence
  // ("verify your phone number…") and falls back to its own only when a failure
  // carried none.
  //
  // DRIVEN BY WHAT `claim` RETURNS, not by watching its `error` value, and a
  // test caught the difference. React coalesces the clear-at-start with the
  // set-in-catch, so a SECOND identical failure never changed the value and an
  // effect keyed on it never re-ran: one toast for two taps, with the second tap
  // looking like it had not registered — the exact silence GAS_CLAIM_COPY.failed
  // exists to prevent.
  const claimAndReport = useCallback(
    async (chain_id: string) => {
      const failure = await claim(chain_id)
      if (failure !== null) showToast('error', failure)
    },
    [claim],
  )

  return useCallback(
    (chain_id: string) => {
      const offer = gasClaimForChain(chains, chain_id)
      if (offer === null || !offer.available) return null
      return (
        <GasClaimChip offer={offer} claiming={claiming === chain_id} onClaim={claimAndReport} />
      )
    },
    [chains, claiming, claimAndReport],
  )
}
