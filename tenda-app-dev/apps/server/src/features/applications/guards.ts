/**
 * Application guards — the wiring between the pure rules and the database.
 *
 * Mirrors features/capacity/guards.ts: load config, count, decide, throw a
 * typed AppError. Nothing here makes a policy decision of its own.
 */

import { ErrorCode, findChain, normalizeChainAddress, truncateWallet, type ChainNamespace } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import { assertCallerWallet } from '@server/lib/escrow'
import {
  resolveAssigneeWalletAddress,
  resolvePrimaryWalletAddress,
  resolveUserByWallet,
} from '@server/lib/auth/resolver'
import {
  applicationCapacityMessage,
  checkApplicationCapacity,
  isAssignable,
  type ApplicationSnapshot,
} from '@server/features/applications/service'
import { drizzleApplicationStore, type ApplicationRow } from '@server/features/applications/store'
import type { AppDatabase } from '@server/plugins/db'

/**
 * Refuses a new application once the worker already holds
 * `platform_config.max_open_applications` open ones.
 *
 * Spam control, not a consequence: the thing that makes applying cost
 * something is D2's strike rule, which attaches to being assigned and then
 * ghosting. This just stops one account blanketing every open gig.
 *
 * Skipped when the applicant already has an open row on THIS gig, because
 * re-applying upserts that row and therefore consumes no additional slot —
 * counting it would make editing your own pitch impossible at the cap.
 *
 * `existing` is passed in rather than looked up: the caller has to read the
 * row anyway (a first application and a re-application are different events),
 * and querying it twice invites the two reads to disagree under a concurrent
 * withdraw.
 */
export async function assertApplicationCapacity(
  db: AppDatabase,
  applicant_id: string,
  existing: ApplicationSnapshot | null,
): Promise<void> {
  if (existing !== null && existing.status === 'open') return

  const store = drizzleApplicationStore(db)
  const cfg = await getPlatformConfig(db)
  const open = await store.countOpen(applicant_id)
  const check = checkApplicationCapacity(open, cfg.max_open_applications)
  if (check.allowed) return

  throw new AppError(
    403,
    ErrorCode.APPLICATION_LIMIT_REACHED,
    applicationCapacityMessage(check),
    { open: check.open, limit: check.limit, remaining: check.remaining },
  )
}

/**
 * The chain namespace an applicant must hold a wallet on, from the gig's
 * chain id. The manifest is static and every escrow's chain_id came from it
 * at create, so a miss is configuration rot, not user error — 503, never 500.
 */
export function applicationChainNamespace(chain_id: string): ChainNamespace {
  const chain = findChain(chain_id)
  if (chain === undefined) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `chain '${chain_id}' is not currently available`,
    )
  }
  return chain.namespace
}

/**
 * The wallet an application records — the address an assignment will BAKE.
 *
 * A declared choice must be one of the CALLER's verified wallets on the gig's
 * namespace (same trust rule, same 422 as the signer preference). No choice
 * falls back to their primary. Either way the applicant needs SOME wallet on
 * the gig's chain: 403 WALLET_REQUIRED (with chain_ns, so clients route to
 * the link-wallet flow) — an application from a worker who cannot be assigned
 * on this chain would be dead on arrival, discovered only by the POSTER at
 * assign time.
 *
 * Returned in CANONICAL form (EVM lowercased), never the client's casing:
 * EVM equality folds case, so a scrambled-checksum variant of the caller's
 * own wallet passes the trust check — but viem refuses a bad-checksum
 * mixed-case address at ENCODE time, so recording it verbatim would let an
 * applicant mint a 500 on the poster's assign build.
 */
export async function resolveApplicantWallet(
  db: AppDatabase,
  args: { user_id: string; chain_ns: ChainNamespace; declared: string | null },
): Promise<string> {
  if (args.declared !== null) {
    await assertCallerWallet(db, {
      user_id: args.user_id,
      chain_ns: args.chain_ns,
      address: args.declared,
    })
    return normalizeChainAddress(args.chain_ns, args.declared)
  }
  const primary = await resolvePrimaryWalletAddress(db, args.user_id, args.chain_ns)
  if (primary === null) {
    throw new AppError(
      403,
      ErrorCode.WALLET_REQUIRED,
      `link a ${args.chain_ns} wallet before applying — this gig pays on that chain`,
      { chain_ns: args.chain_ns },
    )
  }
  return normalizeChainAddress(args.chain_ns, primary)
}

/**
 * The wallet an assignment bakes for this application's worker.
 *
 * The RECORDED choice wins — that is the whole contract — but it must still
 * be linked to the worker (they may have unlinked it since applying), and a
 * stale choice is REFUSED, never silently swapped for the primary: baking a
 * wallet the worker did not choose is the bug this feature removes. Rows that
 * predate the choice keep the primary-first resolution they were created
 * under.
 */
export async function resolveApplicationBakeWallet(
  db: AppDatabase,
  args: {
    application: Pick<ApplicationRow, 'wallet_address'>
    worker_user_id: string
    chain_ns: ChainNamespace
  },
): Promise<string> {
  const recorded = args.application.wallet_address
  if (recorded === null) {
    return resolveAssigneeWalletAddress(db, args.worker_user_id, args.chain_ns)
  }
  const owner = await resolveUserByWallet(db, { chain_ns: args.chain_ns, address: recorded })
  if (owner !== args.worker_user_id) {
    throw new AppError(
      422,
      ErrorCode.ASSIGNEE_WALLET_REQUIRED,
      `the worker applied with ${truncateWallet(recorded)}, which is no longer linked to their account — ask them to re-link it or apply again`,
      { chain_ns: args.chain_ns, assignee_id: args.worker_user_id },
    )
  }
  return recorded
}

/**
 * The application a poster is assigning from must still be live.
 *
 * A stale row is not merely untidy: assigning from one would stamp
 * `assigned_from_application`, making a worker who applied weeks ago liable
 * for an abandonment strike on a gig they have long forgotten.
 */
export function assertAssignable(
  application: ApplicationSnapshot | null,
  now: Date,
): asserts application is ApplicationSnapshot {
  if (application === null) {
    throw new AppError(
      404,
      ErrorCode.NOT_FOUND,
      'That worker has no application on this gig.',
    )
  }
  if (!isAssignable(application, now)) {
    throw new AppError(
      409,
      ErrorCode.APPLICATION_NOT_OPEN,
      application.status === 'open'
        ? 'That application has expired. Ask the worker to apply again.'
        : `That application is no longer open (${application.status}).`,
    )
  }
}
