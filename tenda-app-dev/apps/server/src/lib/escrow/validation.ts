/**
 * Escrow asset-policy guards. The eligible assets per chain are derived from
 * the shared CHAIN_MANIFEST (gigAssetByChain / exchangeAssetsByChain), the SAME
 * source the mobile pickers read, so client options and these guards can never
 * disagree. Add a chain to the manifest when its `chains` + `assets` rows are
 * seeded. Both guards are pure (no DB) — the `assets` table remains the source
 * of truth for asset EXISTENCE; these are narrow policy filters on top.
 */

import { AppError } from '@server/lib/errors'
import { ErrorCode, gigAssetByChain, exchangeAssetsByChain } from '@tenda/shared'
import type { AssetId, ChainId } from '@server/chains/types'

/**
 * Throws if `asset_id` isn't the gig-eligible USDC variant for `chain_id`.
 * Pure, does not consult the DB. The `assets` table is the canonical source
 * of truth for asset existence; this guard is a narrow policy filter layered
 * on top to enforce "USDC only" for gigs without a per-request DB roundtrip.
 *
 * Throws `ESCROW_INVALID_ASSET` (422) for both unknown chains and wrong assets,
 * route handlers should not distinguish the two (both are user-input errors).
 */
export function assertGigAsset(asset_id: AssetId, chain_id: ChainId): void {
  const expected = gigAssetByChain(chain_id)
  if (expected === null) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_INVALID_ASSET,
      `chain '${chain_id}' is not configured for gig escrows`,
    )
  }
  if (asset_id !== expected) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_INVALID_ASSET,
      `gigs on '${chain_id}' must use '${expected}'; got '${asset_id}'`,
    )
  }
}

/**
 * Throws if `asset_id` isn't exchange-tradable on `chain_id`. Unlike gigs
 * (USDC-only), the exchange trades a SET per chain — USDC plus the native
 * token — so this is a membership check against exchangeAssetsByChain.
 *
 * Throws `ESCROW_INVALID_ASSET` (422) for both unconfigured chains and
 * ineligible assets (both are user-input errors).
 */
export function assertExchangeAsset(asset_id: AssetId, chain_id: ChainId): void {
  const eligible = exchangeAssetsByChain(chain_id)
  if (eligible.length === 0) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_INVALID_ASSET,
      `chain '${chain_id}' is not configured for exchange escrows`,
    )
  }
  if (!eligible.includes(asset_id)) {
    throw new AppError(
      422,
      ErrorCode.ESCROW_INVALID_ASSET,
      `exchange offers on '${chain_id}' must use one of ${eligible.join(', ')}; got '${asset_id}'`,
    )
  }
}
