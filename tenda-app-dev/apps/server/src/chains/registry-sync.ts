/**
 * Where a chain's escrow address comes from, and the boot check that stops the
 * DB copy of it from going stale.
 *
 * There are two consumers of that address with different reach: the server's
 * own adapters read it from env (`chains/secrets/`), while mobile has to be
 * TOLD it — it builds and signs transactions locally and cannot see `.env`, so
 * the value travels over `/v1/platform/chains`.
 *
 * It used to travel via `chains.escrow_program`, a column written only by
 * `db:seed`. Env is re-read every boot; the column is re-written only when
 * somebody remembers to re-seed — and a redeploy feels like an env change, not
 * a schema change. So the column drifted, silently and by two contract
 * generations on both EVM testnets (2026-07-27): the server kept working
 * because it never reads the column, while mobile was handed dead addresses.
 *
 * The route now serves from the loader, which removes that failure mode. The
 * column still exists (the seed writes it, and it is worth having on the row a
 * mediator or an operator reads), so `assertChainRegistryInSync` is what keeps
 * the two honest.
 */

import { eq } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema'
import { ESCROW_IDL } from '@tenda/shared/idl'
import type { ResolvedChainSecret } from '@server/chains/secrets'
import type { AppDatabase } from '@server/plugins/db'

/**
 * The deployed escrow program/contract for one configured chain.
 *
 * Solana's comes from the IDL artifact rather than env: the program id is
 * `declare_id!`, propagated by `sync:idl` and guarded by
 * `scripts/check-program-id.mjs`, so an env copy would be a fourth place to
 * keep in step. EVM has no such artifact — the address is deployment output,
 * so it is configuration.
 *
 * ONE function for it, because the seed, the public route and the boot check
 * all need the same answer, and three inline ternaries is how they stop
 * agreeing.
 */
export function escrowAddressOf(secret: ResolvedChainSecret): string {
  return secret.namespace === 'solana' ? ESCROW_IDL.address : secret.escrow
}

export interface RegistryMismatch {
  chain_id: string
  field: 'escrow_program' | 'treasury_address'
  /** What the DB row says — what clients would have been told. */
  stored: string
  /** What env/IDL says — what the server itself uses. */
  expected: string
}

/**
 * Compare the seeded registry against the live configuration.
 *
 * Case-insensitive: EVM addresses are hex and the checksum casing of an env
 * value and a stored one legitimately differ, while pointing at the same
 * contract. A case-only difference is not drift and must not block boot.
 */
export async function findRegistryMismatches(
  db: AppDatabase,
  secrets: Map<string, ResolvedChainSecret>,
): Promise<{ mismatches: RegistryMismatch[]; unseeded: string[] }> {
  const rows = await db
    .select({
      id: chains.id,
      escrow_program: chains.escrow_program,
      treasury_address: chains.treasury_address,
    })
    .from(chains)
    .where(eq(chains.is_enabled, true))

  const byId = new Map(rows.map((r) => [r.id, r]))
  const mismatches: RegistryMismatch[] = []
  const unseeded: string[] = []

  for (const [chain_id, secret] of secrets) {
    const row = byId.get(chain_id)
    if (row === undefined) {
      unseeded.push(chain_id)
      continue
    }
    const expected: Array<[RegistryMismatch['field'], string, string]> = [
      ['escrow_program', row.escrow_program, escrowAddressOf(secret)],
      ['treasury_address', row.treasury_address, secret.treasury],
    ]
    for (const [field, stored, want] of expected) {
      if (stored.toLowerCase() !== want.toLowerCase()) {
        mismatches.push({ chain_id, field, stored, expected: want })
      }
    }
  }
  return { mismatches, unseeded }
}

function describe(m: RegistryMismatch): string {
  return `  ${m.chain_id} ${m.field}: db has ${m.stored}, env/IDL says ${m.expected}`
}

/**
 * Boot gate. A MISMATCH throws; a chain with no row at all only warns.
 *
 * The asymmetry is deliberate. A missing row is the ordinary bootstrap order
 * (migrate → start → seed), and refusing to boot on it would make a fresh
 * database unstartable; it also cannot be acted on, since `escrows.chain_id`
 * is a foreign key and creation on that chain fails loudly at the first insert
 * either way.
 *
 * A mismatch is different, and the reason is NOT that these values are served
 * — since 2026-07-27 they are not, the route reads the adapter. It is that
 * `db:seed` writes `chains` and `assets` in one run, so a chains row that
 * disagrees with config is evidence the seed has not run since the deploy that
 * changed it — which puts the ASSETS rows in doubt, and `assets.token_address`
 * IS served and IS what the mobile balance reader and the approve/permit flows
 * spend against. The cheap, verifiable column stands in for the expensive,
 * unverifiable one.
 */
export async function assertChainRegistryInSync(
  db: AppDatabase,
  secrets: Map<string, ResolvedChainSecret>,
  log: { warn(msg: string): void },
): Promise<void> {
  const { mismatches, unseeded } = await findRegistryMismatches(db, secrets)

  if (unseeded.length > 0) {
    log.warn(
      `[chains] configured but not seeded: ${unseeded.join(', ')} — run \`pnpm db:seed\`. ` +
        'Escrow creation on these chains will fail the chain_id foreign key until you do.',
    )
  }

  if (mismatches.length > 0) {
    throw new Error(
      'chain registry is stale — the DB disagrees with the configured chains:\n' +
        mismatches.map(describe).join('\n') +
        '\n  Run `pnpm db:seed` (idempotent) to reconcile.\n' +
        '  This blocks boot because `db:seed` writes chains AND assets together, so a\n' +
        '  stale chain row means the seed has not run since this deploy — and the asset\n' +
        '  rows it would also have written (token_address) ARE served to mobile.',
    )
  }
}
