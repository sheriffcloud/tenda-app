/**
 * The gas-seed CLAIM, on mobile — the whole feature, in one directory.
 *
 * WHERE IT APPEARS (#100, replacing the wallet-screen card stack): as a small
 * chip at the end of the balance row for a chain the user holds no gas on. The
 * zero balance IS the trigger, so the offer shows up exactly where the problem
 * is and a user with gas everywhere never sees it. Nothing else renders — not a
 * heading, not a card, and not an explanation of why a claim is unavailable.
 *
 * WHAT THAT REPLACED, so nobody rebuilds it: a `GasClaimSection` that rendered
 * one bordered card PER CHAIN between the balance rows and the wallet actions,
 * including cards whose only content was a refusal. On a deployment with several
 * seedable chains that was a wall of text in the middle of the app's
 * most-visited screen, and for anyone who had already claimed it never went
 * away. The component also carried a `variant="inline"` for the contextual
 * placement that was never wired — the two-surface design was documented, half
 * built, and the intrusive half is what shipped.
 *
 * A HOST CONTRIBUTES PLACEMENT AND NOTHING ELSE. What to fetch, which chains may
 * be offered, what the chip says and what happens when a claim fails all live
 * here. That is not tidiness: two placements each deciding "may I offer this?"
 * is how one of them ends up offering a claim to a user who already has the
 * money.
 *
 * HOW TO ADD A PLACEMENT
 *   const renderGasChip = useGasClaimChip()
 *   …pass it wherever a per-chain slot exists, e.g.
 *   <WalletBalanceRows balances={balances} renderChainAction={renderGasChip} />
 *
 * REMOVAL RECIPE — keep this true:
 *   1. delete this directory;
 *   2. delete the `useGasClaimChip()` call and the `renderChainAction` prop from
 *      `app/(tabs)/wallet.tsx` (the `renderChainAction` prop on
 *      `WalletBalanceRows` is generic and may stay or go — it names no feature);
 *   3. delete the `wallet:` line from `createApiClient` in
 *      `@tenda/shared/api/client` and `api/client/wallet.ts` beside it.
 * The session client stamp in `api/request.ts` STAYS: it records which client
 * minted a session, which is a generic fact this feature happens to read.
 */

export { GasClaimChip, type GasClaimChipProps } from './GasClaimChip'
export { useGasClaimChip } from './useGasClaimChip'
export {
  useGasClaim,
  gasClaimForChain,
  type GasClaimState,
  type UseGasClaimOptions,
} from './useGasClaim'
export { GAS_CLAIM_COPY } from './copy'
