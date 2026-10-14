/**
 * UUID shape check, used to short-circuit a query before it reaches the
 * driver. Every id column in the schema is postgres `uuid`, which rejects
 * malformed input with `invalid input syntax for type uuid` — a thrown query
 * where the caller almost always wants a clean 404 / `false` instead.
 *
 * Lives here rather than beside any one caller: seven modules across escrows,
 * admin auth, notifications, applications and the WS channel guard need it,
 * and none of them is the natural owner.
 */

/** Standard 8-4-4-4-12 hex layout, case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidLike(id: string): boolean {
  return UUID_RE.test(id)
}
