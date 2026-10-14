/**
 * One-off data repair for #58: give every pre-existing `gas_grants` row the
 * status its tx_ref used to encode.
 *
 *   pnpm --filter tenda-server db:backfill-gas-grant-status [--dry-run]
 *
 * RUN IT RIGHT AFTER `db:migrate`, BEFORE serving traffic. The migration adds
 * `status` with a DEFAULT of 'claimed', which is correct for a fresh insert and
 * wrong for every historical row — a grant that was delivered months ago would
 * read as "slot reserved, nothing signed", so its owner would be shown a
 * permanent spinner and the audit would list a healthy grant as unfinished.
 *
 * THE MAPPING, and it is a translation rather than a guess. Before #58 the
 * tx_ref carried the state in a string:
 *
 *   'pending:<user>:<chain>'  → the slot was claimed and nothing was ever
 *                               broadcast. Becomes status `claimed` with a NULL
 *                               reference, which is how that is now spelled.
 *   any other value           → a real on-chain reference, which the old code
 *                               only ever wrote after a transfer had confirmed.
 *                               Becomes `delivered`.
 *
 * THE SECOND MAPPING IS TRUSTED, NOT VERIFIED, and that is worth stating because
 * of #57: on Solana the old confirmation resolved for a transaction that landed
 * and FAILED, so a small number of `delivered` rows here may name a transfer
 * that moved no lamports. This script does not touch the chain — that is
 * `verify:gas-seed`'s job, and it reads every stamped reference and reports the
 * ones the chain disagrees with. RUN IT AFTERWARDS; between them the repair is
 * complete and neither has to do the other's work.
 *
 * Idempotent: re-running finds no `pending:` rows and re-writes the same values.
 * Read-only with --dry-run.
 */

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq, isNotNull, like, not, sql } from 'drizzle-orm'
import * as schema from '@tenda/shared/db/schema'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import type { AppDatabase } from '@server/plugins/db'

/** The prefix the retired placeholder used. Local: nothing else may grow one. */
const PLACEHOLDER_PREFIX = 'pending:'

/** How many rows each half of the mapping touched, or would touch. */
export interface BackfillCounts {
  /** Placeholder rows returned to `claimed` with a NULL reference. */
  cleared: number
  /** Rows carrying a real reference, promoted to `delivered`. */
  delivered: number
}

/**
 * Rows still carrying the retired placeholder: the slot was claimed and nothing
 * was ever broadcast.
 */
const unbroadcast = and(
  isNotNull(gas_grants.tx_ref),
  like(gas_grants.tx_ref, `${PLACEHOLDER_PREFIX}%`),
)

/**
 * Rows carrying a REAL reference that the migration defaulted to `claimed`.
 *
 * Scoped on the default status, which is what makes a second run a no-op: once
 * promoted, a row no longer matches.
 */
const stamped = and(
  isNotNull(gas_grants.tx_ref),
  not(like(gas_grants.tx_ref, `${PLACEHOLDER_PREFIX}%`)),
  eq(gas_grants.status, 'claimed'),
)

/**
 * What the mapping WOULD do. Read-only.
 *
 * Exported, like the two halves below, because this script rewrites every
 * historical grant row exactly once against a production database — and a
 * mapping whose only test is running it there is not tested. Every other script
 * here exposes its decision the same way (`checkEvmGrant`, `unfinishedResult`),
 * for the same reason: `main` is unreachable from a suite, so anything left
 * inside it ships unchecked.
 */
export async function countBackfillTargets(db: AppDatabase): Promise<BackfillCounts> {
  const [placeholders, real] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(gas_grants).where(unbroadcast),
    db.select({ n: sql<number>`count(*)::int` }).from(gas_grants).where(stamped),
  ])
  return { cleared: placeholders[0]?.n ?? 0, delivered: real[0]?.n ?? 0 }
}

/**
 * Apply the mapping. Idempotent: neither predicate matches its own output.
 *
 * THE TWO UPDATES ARE DISJOINT BY CONSTRUCTION, and that — not their order — is
 * what makes this safe. `stamped` carries `not(like(tx_ref, 'pending:%'))`, so a
 * placeholder can never satisfy it; without that clause a placeholder row would
 * be promoted to `delivered`, marking a user paid for a transfer that never
 * existed, permanently.
 *
 * An earlier version of this comment claimed the ORDER was load-bearing and that
 * running them the other way round would cause exactly that. It would not, and a
 * mutation proof said so: swapping them reddened nothing, because the exclusion
 * clause already does the work. The test now pins the clause instead.
 */
export async function applyBackfill(db: AppDatabase): Promise<BackfillCounts> {
  const cleared = await db
    .update(gas_grants)
    .set({ status: 'claimed', tx_ref: null })
    .where(unbroadcast)
    .returning({ user_id: gas_grants.user_id })

  const delivered = await db
    .update(gas_grants)
    .set({ status: 'delivered' })
    .where(stamped)
    .returning({ user_id: gas_grants.user_id })

  return { cleared: cleared.length, delivered: delivered.length }
}

function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL']
  if (url === undefined || url === '') throw new Error('DATABASE_URL is not set')
  return url
}

async function main(): Promise<void> {
  const dry_run = process.argv.includes('--dry-run')
  const sqlClient = postgres(requireDatabaseUrl(), { max: 1 })
  // WITH the schema, so this handle is an `AppDatabase` and the mapping above
  // takes the same type the suite hands it. A bare `drizzle(client)` would be a
  // differently-typed handle that no test could supply.
  const db = drizzle(sqlClient, { schema })

  try {
    if (dry_run) {
      const would = await countBackfillTargets(db)
      console.log(`would set ${would.cleared} placeholder rows  → claimed (tx_ref NULL)`)
      console.log(`would set ${would.delivered} stamped rows      → delivered`)
      return
    }

    const { cleared, delivered } = await applyBackfill(db)
    console.log(`cleared   ${cleared} placeholder rows → claimed, tx_ref NULL`)
    console.log(`delivered ${delivered} stamped rows`)
    console.log('\nNow run `pnpm --filter tenda-server verify:gas-seed` — it checks every')
    console.log('stamped reference against its chain, which is the half this cannot do.')
  } finally {
    await sqlClient.end({ timeout: 5 })
  }
}

// Execute only when run directly, not on import — the exported mapping above is
// consumed by test/integration/backfill-gas-grant-status.test.ts. Without this
// guard, importing the module RAN the migration: in a suite that meant a throw
// on the missing DATABASE_URL and a failed test file, and anywhere with the
// variable set it would have meant silently rewriting that database's grants.
// Same guard `verify-gas-seed` uses, for the same reason.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
