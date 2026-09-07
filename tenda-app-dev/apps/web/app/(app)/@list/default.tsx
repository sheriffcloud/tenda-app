/**
 * Fallback for the @list slot.
 *
 * Next renders this ONLY when it cannot recover the slot's active state — a
 * hard load. It is NOT what answers a surface with no list column across a
 * soft navigation: there Next keeps the slot's last active subpage, and this
 * file never runs. What stops the previous surface's list from following the
 * reader is `AppWorkspace`, which passes the slot on only for a surface the
 * registry says has a list — read that before changing either.
 *
 * Returning null (rather than notFound()) is deliberate: most surfaces
 * legitimately have no list column, and WorkspaceShell reads a null slot as
 * "no list" and collapses the grid to rail + content.
 *
 * To give a surface a list, add `app/(app)/@list/<surface>/page.tsx` AND a
 * `SURFACE_LIST_HOME` entry — without the entry AppWorkspace never renders the
 * slot, so the list appears nowhere. `list-registry.test.ts` fails on the
 * omission; see components/app/workspace/surfaces.ts for the contract.
 */
export default function ListSlotDefault() {
  return null
}
