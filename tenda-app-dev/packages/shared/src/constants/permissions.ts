/**
 * Code-level permission map (CO8 decision, 2026-06-05). Route guards check
 * PERMISSIONS — not roles — so granting a future role (e.g. a read-only
 * support agent) is a one-line map edit, and graduating to DB-driven RBAC
 * later swaps this module's lookup without touching any call site.
 *
 * Shared (not server-only) so an admin frontend can hide UI the caller's
 * role can't use.
 *
 * Conventions:
 *   - `<domain>.read` / `<domain>.<verb>` — reads split from mutations so a
 *     read-only role stays expressible.
 *   - POST /v1/escrows/:id/resolve is NOT here: the escrow state machine
 *     already derives the 'dispute_admin' caller (lib/escrow-routes.ts);
 *     double-guarding it would create two sources of truth.
 */

import type { AdminRole } from '../types/user'

export const PERMISSIONS = [
  // dispute triage queue (+ #77 mediation threads, Issue-3 resolution queue)
  'disputes.read',
  'disputes.mediate',
  // execute a proposed resolution (reject/sign) — key-holder authority,
  // kept separate from `mediate` so proposer and approver can differ.
  'disputes.execute',
  // admin escrow browser (+ #70 takedown, #78 featured rail)
  'escrows.read',
  'escrows.takedown',
  'escrows.feature',
  // user reports
  'reports.read',
  'reports.action',
  // user management
  'users.read',
  'users.suspend',
  'users.assign_roles',
  // reputation / standing
  'standing.read',
  'standing.manage',
  // money + ops dashboards
  'finance.read',
  'metrics.read',
  // platform config
  'config.read',
  'config.write',
  // announcements
  'announcements.read',
  'announcements.write',
  // moderation verdict queue + overrides
  'moderation.read',
  'moderation.override',
  // fiat rails (providers, intents, reconciliation)
  'fiat.read',
  'fiat.manage',
  // broadcast push
  'push.broadcast',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Role → granted permissions. Keyed by AdminRole (exhaustive: adding a role
 * to the enum forces an entry here). 'user' holds no permissions by
 * construction — the guard treats an unmapped role as the empty set.
 */
export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, ReadonlyArray<Permission>>> = {
  // Scoped to the dispute workflow — mirrors the pre-permission-layer
  // requireRole lists exactly (disputes + admin escrow read).
  dispute_admin: ['disputes.read', 'disputes.mediate', 'escrows.read'],
  // Everything, by construction.
  super_admin: PERMISSIONS,
}

// Precomputed per-role permission sets — O(1) checks. Shared by the server
// guards (requirePermission) and the admin dashboard (nav filtering, #90)
// so the two surfaces can never disagree on what a role may do.
const PERMISSION_SETS: ReadonlyMap<string, ReadonlySet<Permission>> = new Map(
  Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set(perms)]),
)

/** True iff `role` holds `permission`; unmapped roles hold the empty set. */
export function hasPermission(role: string, permission: Permission): boolean {
  return PERMISSION_SETS.get(role)?.has(permission) ?? false
}

/**
 * The roles that hold `permission` — the inverse of `hasPermission`, for
 * callers that must FIND the holders rather than check one.
 *
 * Exists so "who should hear about this?" is answered by the permission that
 * makes someone able to act on it, never by a hand-written role list. A
 * literal like `['dispute_admin', 'super_admin']` is correct only until the
 * next role is added, and then it is silently wrong in the quiet direction:
 * a new role that cannot mediate would start receiving dispute alerts, or a
 * new mediating role would never hear about one.
 *
 * Derived from ROLE_PERMISSIONS on every call rather than precomputed: the map
 * is two entries and the callers are fan-outs, not hot paths, so an
 * inverted-index cache would be a second structure to keep honest for no
 * measurable gain. Returns a fresh array, so a caller sorting or splicing the
 * result cannot corrupt the registry.
 *
 * The keys are asserted rather than read from `ADMIN_ROLES`, and that is
 * deliberate: `ADMIN_ROLES` is a VALUE in types/user.ts, which imports
 * `userRoleEnum` from the drizzle schema at runtime. This module is imported by
 * the admin dashboard (lib/nav.ts, app/page.tsx) and currently has ZERO runtime
 * imports — only `import type` — so reaching for `ADMIN_ROLES` would pull the
 * whole DB schema into a browser bundle to enumerate two strings. The assertion
 * is safe because `ROLE_PERMISSIONS` is typed `Record<AdminRole, …>`, so its
 * keys cannot be anything else, and a test pins the pair against every role.
 */
export function rolesWithPermission(permission: Permission): AdminRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter((role) =>
    hasPermission(role, permission),
  )
}
