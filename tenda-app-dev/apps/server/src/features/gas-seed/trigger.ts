/**
 * The gas seed's ENTRY POINT from the rest of the app.
 *
 * Everything else in this feature is machinery; this is the one function other
 * modules call, which is what makes the feature removable — see ./index.ts for
 * the removal recipe. It moved out of lib/onboarding-deps (which now owns only
 * OTP wiring) so that deleting the seed does not mean editing a file about
 * something else.
 */

import { getChainSecrets } from '@server/chains/secrets'
import type { AppDatabase } from '@server/plugins/db'
import { dispatchGasSeeds, drizzleGasSeedStore, type GasSeedDeps } from './dispatch'
import { buildGasSeedSenders } from './senders'

/**
 * What the gas-seed trigger actually needs from the app: a database and
 * somewhere to log. Narrow for the same reason `OtpSenderHost` in
 * lib/onboarding-deps is —
 * a FastifyInstance would force every caller, tests included, to conjure an
 * instance or cast through `unknown`. A real instance satisfies it structurally,
 * so the routes still pass `fastify`.
 */
export interface GasSeedHost {
  db: AppDatabase
  log: GasSeedDeps['log']
}

/**
 * Fire-and-forget retroactive gas seed for a user whose phone-verify or
 * wallet-link may have just made them eligible. Verification must not block on
 * an RPC transfer, so failures are logged, not surfaced. `dispatchGasSeeds` is
 * idempotent (gas_grants PK) and a cheap no-op when the user has no wallet on a
 * seedable chain, so over-firing (e.g. on a phone login) is safe. ONE place so
 * every trigger (legacy phone shim, link-wallet, unified /auth/verify) stays in
 * lockstep.
 *
 * The deps are built INSIDE the chain, and that placement is load-bearing:
 * `dispatchGasSeeds(buildGasSeedDeps(host), id).catch(…)` evaluates the builder
 * synchronously, so a throw there — building a sender from a malformed
 * hot-wallet secret does throw, and Solana's GAS_SEED_KEY is only validated as
 * a non-empty string — would escape the catch and turn a wallet link that HAD
 * already succeeded into a 500. That failure is what
 * `test/integration/auth-link-wallet.test.ts` measures the route against.
 */
export function fireRetroactiveGasSeed(host: GasSeedHost, userId: string): void {
  void Promise.resolve()
    .then(() => dispatchGasSeeds(buildGasSeedDeps(host), userId))
    .catch((err: unknown) => host.log.warn({ err, user_id: userId }, 'retroactive gas seed failed'))
}

export function buildGasSeedDeps(host: GasSeedHost): GasSeedDeps {
  // One sender per ACTIVE chain that supplies a gas-seed key, whatever its
  // namespace. Chain id and RPC come from that same secret (no hardcoded
  // fallback), and which namespaces can pay at all is ./senders.
  return {
    store: drizzleGasSeedStore(host.db),
    senders: buildGasSeedSenders(getChainSecrets()),
    log: host.log,
  }
}
