/**
 * Wallet-scoped endpoints — today, the gas-seed claim (#53c-1 / #53c-2).
 *
 * Its own group rather than more of `auth`, because these are not about who a
 * user is: they ask what a chain is offering this user and take it. The group
 * is also the seam the gas seed is removed at on the client side — deleting
 * this file and its line in `createApiClient` takes the whole surface with it.
 */
import { apiRoutes } from '../routes'
import type { GasSeedAvailabilityResponse, GasSeedClaimBody, GasSeedClaimResponse } from '../..'
import type { ApiRequest } from './types'

const { wallet } = apiRoutes

export function createWalletApi(request: ApiRequest) {
  return {
    /**
     * Per-user, per-chain gas-seed availability.
     *
     * Never cached across users — the answer depends on the caller's wallets,
     * their grants and the client that minted their session.
     */
    gasSeedAvailability: () =>
      request<GasSeedAvailabilityResponse>('GET', wallet.gasSeedAvailability),
    /**
     * Claim one chain's seed. Answers 202: the slot is taken synchronously and
     * the transfer runs in the background, so a success here means "on its
     * way", not "in your wallet".
     */
    claimGasSeed: (body: GasSeedClaimBody) =>
      request<GasSeedClaimResponse>('POST', wallet.claimGasSeed, { body }),
  }
}
