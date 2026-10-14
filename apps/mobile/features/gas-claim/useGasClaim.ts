/**
 * The gas claim's whole client behaviour: read availability, take the claim,
 * and hold what the surfaces render.
 *
 * ONE hook, because both surfaces show the same thing about the same chain —
 * the wallet screen's card and the inline prompt on a chain with no gas. If
 * each fetched for itself they would disagree the moment one of them claimed,
 * and the screen would show a chain as both claimable and under way.
 */

import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, type GasSeedAvailability } from '@tenda/shared'
import { api } from '@/api/client'
import { GAS_CLAIM_COPY } from './copy'

export interface GasClaimState {
  /** Availability per chain, in the order the server returned it. */
  chains: GasSeedAvailability[]
  /** True until the first read settles, so a card can hold its shape. */
  loading: boolean
  /** The chain id currently being claimed, or null. */
  claiming: string | null
  /** The last claim failure, already human-readable. */
  error: string | null
  /**
   * Claim one chain's seed, then refresh so the state reflects the server.
   *
   * RETURNS the human-readable failure, or null on success — as well as storing
   * it in `error`. The return is what a caller should react to: `error` is a
   * value, and a surface that watched the value missed a SECOND identical
   * failure, because React coalesces the clear-then-set into one commit and an
   * effect keyed on an unchanged value never runs. That silence is the exact
   * thing `GAS_CLAIM_COPY.failed` exists to prevent.
   */
  claim(chain_id: string): Promise<string | null>
  /** Re-read availability — for a pull-to-refresh, or after a grant lands. */
  refresh(): Promise<void>
}

/**
 * Availability for the signed-in user.
 *
 * Deliberately NOT a store: this is per-user, per-request state with no
 * cross-screen lifetime worth keeping, and the wallet screen is the only host
 * (the prompt renders inside it). A module cache here would also have to be
 * registered for sign-out clearing, which is a cost with nothing to buy.
 */
export interface UseGasClaimOptions {
  /**
   * Whether to read availability at all. Defaults to true.
   *
   * Exists because a RENDERER hook cannot be called conditionally (#100): the
   * wallet screen calls it above its own section branch, so without this the
   * offer was fetched on the error, loading and no-wallet paths too — states
   * with no balance row to put a chip on, and in the no-wallet case a round
   * trip whose every answer is `no_wallet`. The component this replaced only
   * mounted inside the ready branch and so never asked.
   */
  enabled?: boolean
}


/**
 * Is this array entry usable as an offer?
 *
 * NARROW ON PURPOSE: an object carrying a string `chain_id`, because that is the
 * field every consumer indexes by and the one whose absence turns a lookup into
 * a crash. It is NOT a shape validation and must not grow into one by accident —
 * whether the client should validate responses properly is the open question
 * #101 carries, and it is a decision about the whole client, not this endpoint.
 *
 * Exists because guarding only the CONTAINER was not enough: a well-formed array
 * holding a null still reached `gasClaimForChain`, whose `c.chain_id` threw on
 * it — the same wallet-screen crash, one level down. Found by re-running the
 * adversarial pass against the first fix instead of trusting it.
 */
function isOffer(entry: unknown): entry is GasSeedAvailability {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as { chain_id?: unknown }).chain_id === 'string'
  )
}

export function useGasClaim({ enabled = true }: UseGasClaimOptions = {}): GasClaimState {
  const [chains, setChains] = useState<GasSeedAvailability[]>([])
  // Not loading when we are not going to read: `loading` means "an answer is
  // coming", and a surface holding its shape for an answer that will never
  // arrive is the skeleton-forever bug.
  const [loading, setLoading] = useState(enabled)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.wallet.gasSeedAvailability()
      // GUARDED, because `request<T>` asserts the shape rather than parsing it
      // (#101). A 200 whose body is not what we asked for — a proxy's own page,
      // a CDN error, a version skew — otherwise reached `setChains` intact and
      // crashed the wallet screen from `gasClaimForChain` during RENDER, since
      // the catch below only fires on a REJECTED request.
      //
      // An empty list is the same answer this file already gives for "we
      // learned nothing", one line down. Deliberately LOCAL: `request<T>`
      // asserts for every endpoint, so validating responses generally is a real
      // decision about the whole client and must not arrive as a side effect of
      // one crash fix. #101 records it.
      setChains(Array.isArray(res.chains) ? res.chains.filter(isOffer) : [])
    } catch {
      // Availability is an OFFER, not a fact the screen depends on: a failed
      // read renders no card at all rather than an error the user can do
      // nothing about, on a screen whose job is showing their balances.
      setChains([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [refresh, enabled])

  const claim = useCallback(
    async (chain_id: string): Promise<string | null> => {
      setClaiming(chain_id)
      setError(null)
      try {
        await api.wallet.claimGasSeed({ chain_id })
        // Re-read rather than patching local state to 'in_progress': the server
        // decides the state, and it is the same read the card renders from, so
        // there is no second source to disagree with it. It also picks up the
        // idempotent answer when this was a second tap.
        await refresh()
        return null
      } catch (e) {
        // The server's message is written for this exact refusal — "verify your
        // phone", "claims are paused" — so it beats a generic sentence. But a
        // failure with NO message (a dropped connection) must still say
        // something: silence here is indistinguishable from a tap that never
        // registered.
        const message = e instanceof ApiClientError ? e.message : GAS_CLAIM_COPY.failed
        setError(message)
        return message
      } finally {
        setClaiming(null)
      }
    },
    [refresh],
  )

  return { chains, loading, claiming, error, claim, refresh }
}

/** The availability entry for one chain, or null when nothing is offered there. */
export function gasClaimForChain(
  chains: readonly GasSeedAvailability[],
  chain_id: string,
): GasSeedAvailability | null {
  return chains.find((c) => c.chain_id === chain_id) ?? null
}
