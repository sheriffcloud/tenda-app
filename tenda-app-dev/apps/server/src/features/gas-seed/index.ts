/**
 * First-link native-gas seed — the whole feature, in one directory.
 *
 * WHAT IT IS. Phone-verified users with a wallet on a seed-bearing chain
 * receive a one-time native-token grant, so a new user can post, accept and
 * settle without first hunting for gas. Which chains qualify, how much, and
 * which hot wallet pays are all configuration (the shared CHAIN_MANIFEST plus
 * `CHAIN_<ID>_GAS_SEED_KEY`); this directory is the mechanism.
 *
 * WHY IT LIVES IN ONE PLACE. The seed must be removable without unpicking it
 * from a dozen files — the same property `features/alerts` and
 * `features/fiat-rails` have, and for the same reason: a subsidy is exactly the
 * kind of thing a business turns off. It was previously spread across
 * `lib/gas-seed.ts`, `chains/gas-seed-senders.ts` and two `chains/*` leaves.
 *
 * REMOVAL RECIPE — keep this true:
 *   1. delete this directory;
 *   2. delete `src/routes/v1/wallet/gas-seed/` (autoloaded, so the folder IS
 *      the registration) — arrives with the claim endpoint, #53c-1;
 *   3. delete the `gas-seed` line from `plugins/queue/payloads.ts` and the one
 *      from `workers/processors.ts` — same;
 *   4. delete the two call sites of `fireRetroactiveGasSeed` (auth/link-wallet,
 *      auth/verify) — these disappear anyway when the claim replaces the
 *      automatic send, #53c-2;
 *   5. delete the `GAS_SEED_SUPPORT` import in `db/seed/rows.ts` and let the
 *      gas columns seed NULL.
 * Nothing else knows this feature exists. Two things deliberately stay behind
 * because they are NOT part of it: `chains/evm/hot-wallet.ts` (the relayer uses
 * the same clients) and any client-stamp on the auth token (a generic session
 * fact, not a seed hook).
 *
 * IMPORT THIS BARREL FROM `src/`, not the files behind it — reaching past it is
 * what turns a removable feature back into a clustered one, and it is `src/`
 * that the removal recipe has to survive. Tests may address a module directly
 * to reach an internal the barrel does not publish (the sender constructors and
 * their port, for instance); a source-scan guard should therefore assert the
 * rule over `src/` only.
 */

export {
  dispatchGasSeeds,
  drizzleGasSeedStore,
  type GasSeedDeps,
  type GasSeedResult,
  type GasSeedSender,
  type GasSeedStore,
  type SeedableChain,
} from './dispatch'

export { buildGasSeedSenders, GAS_SEED_SUPPORT } from './senders'

/**
 * Namespace-specific, but public on purpose: `scripts/verify-gas-seed.ts`
 * derives the funder from the configured secret to check it against what the
 * seeder recorded. Exported HERE rather than imported from `senders/solana`
 * directly, so the removal recipe above stays a directory delete plus known
 * lines — a reach past this barrel is the thing that would break it.
 */
export { gasSeedAddressFromSecret } from './senders/solana'

export { buildGasSeedDeps, fireRetroactiveGasSeed, type GasSeedHost } from './trigger'
