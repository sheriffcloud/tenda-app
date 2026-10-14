/**
 * First-link native-gas seed — the whole feature, in one directory.
 *
 * WHAT IT IS. A one-time native-token grant that lets a new user post, accept
 * and settle without first hunting for gas. Which chains qualify, how much, and
 * which hot wallet pays are all configuration (the shared CHAIN_MANIFEST plus
 * `CHAIN_<ID>_GAS_SEED_KEY`); this directory is the mechanism.
 *
 * ONE TRIGGER: the user asks. `./claim` is the whole entry point, and the
 * automatic first-link send it replaced is GONE (#53c-2 removed `./trigger`
 * and its two call sites in auth/link-wallet and auth/verify). Sending crypto
 * nobody asked for has gray area a claim does not — the recipient may not
 * notice it, may not want it, and the spend landed on everyone who ever linked
 * a wallet rather than on the people who came back.
 *
 * `dispatchGasSeeds` did NOT survive: #58 deleted it. It had claimed to be "the
 * mechanism the claim's background job drives", and that was simply untrue —
 * `claim/job.ts` drives the store and the sender directly, and the type checker
 * confirmed nothing in `src/` had called the orchestrator since #53c-2 removed
 * the auto-send path. What made it worth deleting rather than leaving is that it
 * carried a SECOND copy of the send-and-interpret logic whose only correct
 * version now lives in the two claim jobs.
 *
 * Claim-before-send survives, because that is the property that matters: the
 * `(user_id, chain_id)` primary key only prevents a double pay if the row exists
 * before any money moves.
 *
 * WHY IT LIVES IN ONE PLACE. The seed must be removable without unpicking it
 * from a dozen files — the same property `features/alerts` and
 * `features/fiat-rails` have, and for the same reason: a subsidy is exactly the
 * kind of thing a business turns off.
 *
 * REMOVAL RECIPE — keep this true:
 *   1. delete this directory;
 *   2. delete `src/routes/v1/wallet/gas-seed/` (autoloaded, so the folder IS
 *      the registration for both endpoints);
 *   3. delete the registry lines for BOTH queues — `'gas-seed'` and
 *      `'gas-seed-confirm'` (#58 split broadcasting from confirming) — in
 *      `plugins/queue/payloads.ts`, `queue/workers/processors/index.ts`, and
 *      `plugins/workers.ts`'s `WORKER_CONCURRENCY`; that last one is not
 *      optional, the map is `Record<JobName, number>` and omitting an entry
 *      fails the type check;
 *   4. delete the `GAS_SEED_SUPPORT` import in `db/seed/rows.ts` and let the
 *      gas columns seed NULL;
 *   5. delete the seed's ALERT — `features/alerts/kinds/gas-seed-low-balance.ts`,
 *      `kinds/gas-seed-balance-reader.ts`, `monitors/gas-seed-balance.ts`, the
 *      `channels/slack/kinds/gas-seed-low-balance.ts` copy and their registry
 *      entries, plus that monitor's own FOUR queue lines for
 *      `'gas-seed-balance-check'` — the payload, the WORKER_CONCURRENCY entry,
 *      the processor, and (unlike the claim queue, which is event-driven) a
 *      REPEATABLES entry, because the monitor is scheduled. Miss the last one
 *      and `test/unit/worker-schedule.test.ts` fails, which is the point of it.
 *      It lives under features/alerts rather than
 *      here ON PURPOSE, so the dependency between the two features runs ONE
 *      way: alerts reads this barrel (from ONE file,
 *      `features/alerts/kinds/gas-seed-balance-reader.ts`, which is the whole
 *      of the seam), and nothing here reads alerts. The other arrangement
 *      closes the loop and costs both features their recipe — the price is
 *      this line;
 *   6. optionally delete `packages/shared/src/db/schema/gas-seed.ts` (both
 *      tables live there, and only there) plus the two gas columns on `chains`,
 *      in a generated migration. NOT required — an unread table costs nothing,
 *      and the grant history is worth keeping even after the feature stops.
 * Nothing else knows this feature exists. Three things deliberately stay behind
 * because they are NOT part of it: `chains/evm/sender/hot-wallet.ts` (the relayer uses
 * the same clients), `resolvePrimaryWalletAddress`'s deterministic ordering
 * (a fix to shared auth code, good on its own merits, and six modules depend on
 * it), and the session client stamp on the auth token (a generic session fact —
 * see shared constants/session.ts — not a seed hook).
 *
 * IMPORT THIS BARREL FROM `src/`, not the files behind it — reaching past it is
 * what turns a removable feature back into a clustered one, and it is `src/`
 * that the removal recipe has to survive. Tests may address a module directly
 * to reach an internal the barrel does not publish (the sender constructors and
 * their port, for instance); the source-scan guard in
 * test/unit/gas-seed-module-boundary.test.ts therefore asserts the rule over
 * `src/` only.
 */

export {
  drizzleGasSeedStore,
  type GrantForJob,
  type GasSeedSender,
  type GasSeedStore,
  type GasSeedTransferStatus,
  type SeedableChain,
  type SignedGasSeedTransfer,
} from './claim/grants'

export {
  buildGasSeedSenders,
  buildGasSeedFunders,
  GAS_SEED_SUPPORT,
  type GasSeedFunder,
} from './senders'

/**
 * `gasSeedAddressFromSecret` USED to be re-exported here, for
 * `scripts/verify-gas-seed.ts` — which derived the funder from the configured
 * secret to check it against what the seeder recorded. #53b removed that need:
 * the audit reads each grant's OWN `funder_address`, falling back to the
 * chain's recorded `gas_seed_wallet_address`, because checking history against
 * the currently configured key flags every grant an older key paid. Nothing in
 * `src/` reaches for it any more (the module-boundary guard is what noticed),
 * so it is gone from this surface rather than left as a barrel entry whose
 * justification no longer holds. It is still used INSIDE the feature, by
 * `senders/index.ts`, and by seed-v2-gas-seed.test.ts against the module.
 *
 * `SolanaGasSeedPort` stays: the LiteSVM helper implements it (#53b item 5).
 */
export type { SolanaGasSeedPort } from './senders/solana'

// ---------- the claim surface (#53c-1) ------------------------------------------

export {
  claimGasSeed,
  gasSeedAvailability,
  type ClaimIdentity,
  type GasSeedClaimDeps,
  type GasSeedClaimJob,
} from './claim/service'

export {
  claimRefusal,
  evaluateClaim,
  grantState,
  type ChainClaimFacts,
  type ClaimantFacts,
  type GrantFacts,
} from './claim/eligibility'

export { drizzleGasSeedClaimStore, type GasSeedClaimStore } from './claim/store'

export { handleGasSeedClaim, type GasSeedJobDeps, type GasSeedJobOutcome } from './claim/job'

export {
  handleGasSeedConfirm,
  type GasSeedConfirmDeps,
  type GasSeedConfirmOutcome,
  type GasSeedGrantedNotice,
} from './claim/confirm'

export {
  buildGasSeedClaimDeps,
  buildGasSeedConfirmDeps,
  buildGasSeedJobDeps,
  gasSeedConfirmJobId,
  cachedFunders,
  gasSeedFunders,
  gasSeedJobId,
  resetGasSeedFunderCache,
  type GasSeedClaimHost,
} from './claim/deps'
