/**
 * Who should hear about a dispute — the mediator roster.
 *
 * Derived from the PERMISSION that makes someone able to act on a dispute,
 * never from a hand-written role list. `['dispute_admin', 'super_admin']` is
 * correct only until the next role exists, and then it is wrong in the quiet
 * direction: a new mediating role never hears about a dispute, or a new
 * non-mediating one starts receiving them. `rolesWithPermission` keeps the
 * roster and the route guards reading the same registry.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { rolesWithPermission } from '@tenda/shared'
import type { AlertDeps } from './types'

/**
 * The permission that defines a mediator — the query filter and both warnings
 * read this one binding, so the roster and what gets logged about it can never
 * name different permissions.
 */
const MEDIATOR_PERMISSION = 'disputes.mediate'

export async function mediatorUserIds(
  deps: Pick<AlertDeps, 'db' | 'log'>,
  /**
   * Ids to leave out — the escrow's parties. An admin who is a party already
   * gets the party notice, and `assertCanClaimDispute` (lib/disputes/
   * claim-store.ts) already bars them from claiming the dispute, so paging
   * them as a mediator is both noise and a contradiction of the conflict rule
   * the rest of the system enforces. Nullable entries are allowed so callers
   * can pass an unassigned counterparty without filtering at the call site.
   *
   * REQUIRED, with no default. `= []` would read as "exclusion is optional",
   * and a caller that forgot it would page conflicted admins — a correctness
   * bug that produces MORE notifications, so nothing downstream fails and no
   * test catches it. Pass `[]` explicitly to mean "exclude nobody".
   */
  exclude: readonly (string | null)[],
): Promise<string[]> {
  const roles = rolesWithPermission(MEDIATOR_PERMISSION)

  // An empty roster is the honest answer — no role holds the permission, so
  // nobody does — and the query could only come back empty anyway.
  //
  // The WARNING is why this branch exists, not the early return. An earlier
  // version of this comment claimed `inArray(col, [])` is not a well-formed
  // predicate; that is FALSE for the drizzle we run (0.44.7 compiles it to
  // `sql`false``, checked in node_modules), so skipping the query is a saved
  // round trip and nothing more. What cannot be recovered any other way is the
  // ops signal: a permission registry that grants `disputes.mediate` to nobody
  // silently routes every dispute to no one, and without this line the only
  // symptom is an empty list that looks exactly like a healthy quiet day.
  //
  // UNREACHABLE while the registry grants the permission to anyone, and the
  // recipients test asserts exactly that, so this is defence against a future
  // registry edit rather than a live path.
  if (roles.length === 0) {
    deps.log.warn({ permission: MEDIATOR_PERMISSION }, 'no role holds the mediator permission')
    return []
  }

  const rows = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.role, roles),
        // Suspended admins are locked out at authentication (plugins/auth.ts
        // and lib/auth/session.ts both reject them), so they cannot open the
        // dispute they would be paged about. Alerting them is noise, and worse,
        // it inflates the roster into looking like someone is watching.
        eq(users.status, 'active'),
      ),
    )

  // Filtered in memory rather than with `notInArray`: the roster is a handful
  // of rows, `exclude` is routinely empty (which has the same empty-predicate
  // problem as above), and the party ids arrive on the Alert already — this is
  // set arithmetic, not a query.
  const excluded = new Set(exclude.filter((id): id is string => id !== null))
  const recipients = rows.map((r) => r.id).filter((id) => !excluded.has(id))

  if (recipients.length === 0) {
    // Not an error — a deployment can legitimately have no mediator yet, and a
    // throw here would fail the whole alert job and lose the other channels.
    // But it IS an ops fact: a dispute just landed and it reached nobody. The
    // counts distinguish "we have no admins" from "every admin is a party".
    deps.log.warn(
      { permission: MEDIATOR_PERMISSION, roles, found: rows.length, excluded: excluded.size },
      'dispute alert has no in-app recipients',
    )
  }

  return recipients
}
