/**
 * Turning the user ids an `Alert` carries into names a human can read.
 *
 * Names are resolved HERE, in the delivery path, and are deliberately NOT
 * fields on the `Alert` itself. An alert is queued as identifiers and resolved
 * at delivery (see the pipeline note in ./types), so a name carried on the
 * queued object would be frozen at enqueue time — a retry an hour later would
 * render whatever the profile said back then. Reading them at delivery also
 * keeps `AlertFields` to what a mediator needs to TRIAGE, rather than growing a
 * parallel `*_name` beside every `*_id`.
 *
 * Two functions rather than one lookup: loading is async and needs the DB,
 * rendering is pure. That split is what lets a channel's copy be unit-tested
 * against a plain Map with no database, the same way workers/escrow-fanout
 * splits copy.ts from the fan-out that queries.
 */

import { inArray } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { displayName } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'

/** Resolved display names, keyed by user id. Absent = no such user row. */
export type AlertPartyNames = ReadonlyMap<string, string>

/**
 * Load display names for the ids an alert names.
 *
 * Takes `(string | null)[]` so callers can pass the alert's fields straight in
 * — `counterparty_id` and `raised_by_id` are legitimately null — instead of
 * every call site repeating the same filter. Duplicates are collapsed: the
 * raiser is almost always one of the two parties, so the un-deduplicated list
 * would ask for three ids to get two rows.
 */
export async function loadAlertPartyNames(
  db: AppDatabase,
  ids: readonly (string | null)[],
): Promise<AlertPartyNames> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]

  // An alert whose ids are all null is a real case — nobody to look up is not
  // an error — and asking postgres for `id in ()` can only come back empty.
  //
  // This is an OPTIMISATION, not a correctness guard, and that was measured
  // rather than assumed: drizzle 0.44.7 compiles `inArray(col, [])` to
  // `sql`false``, so removing this line changes nothing but the round trip
  // (verified — the integration test still passes without it). Kept because a
  // certain-empty query is worth skipping, and because the behaviour then does
  // not depend on that drizzle detail staying true.
  if (wanted.length === 0) return new Map()

  const rows = await db
    .select({ id: users.id, first_name: users.first_name, last_name: users.last_name })
    .from(users)
    .where(inArray(users.id, wanted))

  return new Map(
    rows.map((row) => [row.id, displayName(row.first_name, row.last_name, row.id)]),
  )
}

/**
 * Render one id, whether or not it was found.
 *
 * Both fallbacks come from the shared `displayName` rather than a literal here,
 * so an operator alert, the admin dossier and the mobile app all name an
 * anonymous party identically:
 *   - a MISSING row (deleted between the chain event and delivery) still yields
 *     `User <first 8>`, which is enough to search the dashboard by;
 *   - a NULL id yields `Unknown`, which is the honest answer when the chain
 *     attested no actor and there is no triage row either.
 *
 * Never throws and never returns an empty string. That second guarantee is why
 * the blank check below is `??`-free: a Map entry holding `''` would sail
 * through `names.get(id) ?? fallback`, because an empty string is not nullish,
 * and the caller bolds this text — so it would render as `**`, which reads as a
 * rendering fault rather than as an unnamed party. `loadAlertPartyNames` cannot
 * produce one today (every value comes from `displayName`, which has its own
 * fallbacks), but this function is exported and the guarantee is stated, so it
 * holds for any Map rather than only for the one map that happens to feed it.
 */
export function alertPartyName(names: AlertPartyNames, id: string | null): string {
  if (id === null) return displayName(null, null)
  const found = names.get(id)
  return found !== undefined && found.trim() !== '' ? found : displayName(null, null, id)
}
