/**
 * Who may see the PRIVATE half of an escrow detail, and the two projections
 * that decide what each reader gets.
 *
 * They are opposites, and both are needed. `scopeEscrowPrivateFields` WITHHOLDS
 * — counterparty, proofs, dispute go to the parties or to nobody.
 * `scopeEscrowAcceptanceMode` PUBLISHES a derived fact (someone is invited)
 * while withholding the identity behind it, because an outsider told nothing at
 * all would conclude the escrow is open to anyone and offer an Accept the chain
 * reverts. Withholding a field is not always the safe default; withholding it
 * without saying it exists is how the client ends up guessing.
 *
 * `/v1/gigs/:id` is public (optionally authenticated) and `/v1/exchange/:id`
 * is readable by any signed-in user — both by design, a listing has to survive
 * a share link and a push deep-link. But "the listing is public" was silently
 * being read as "everything hanging off it is public too": the counterparty's
 * profile, the proof-of-work files, and the dispute reason all shipped to
 * anyone holding the id, at every status. Those describe the WORK RELATIONSHIP,
 * not the listing, so they are scoped to the parties.
 *
 * THREE rungs, and the difference between them is load-bearing:
 *
 *   isEscrowPartyRow            creator + accepted counterparty
 *   isEscrowPartyOrAssignedRow  + a pending direct-offer assignee
 *   canViewHiddenEscrow         + any admin role
 *
 * The first two live in `escrow-party.ts`, which owns the column set for every
 * sense of "party" in both SQL and row form. This module adds only the admin
 * rung and the two projections, because only those are specific to the detail
 * routes.
 *
 * The admin rung is separated from the other two ON PURPOSE. It reads
 * `viewer.role`, and a role is only trustworthy on a route that ran the full
 * `authenticate` — that decorator re-reads the role from the DB precisely so a
 * demotion takes effect in 60s instead of waiting out a 7-day token. The
 * lenient `identifyViewer` path does a bare `jwtVerify`, so the role there is
 * whatever the JWT claimed when it was issued. Gating DISCLOSURE on that would
 * hand a demoted admin every escrow's private half for a week. Party
 * membership has no such problem: it is a fact about the escrow row, not about
 * the caller's current standing.
 *
 * So: disclosure is party-based (id only, no role), and the hidden-row gate —
 * which both routes reach only after a full `authenticate` — may consult the
 * role. Admins read escrows through the admin surfaces, which carry the same
 * evidence behind their own permissions:
 *
 *   GET /v1/admin/escrows/:id/dossier  `escrows.read`   proofs, parties,
 *                                                       transactions, exchange
 *                                                       payment_proof_url
 *   GET /v1/admin/disputes             `disputes.read`  the dispute reason
 *
 * Two different permissions, not one — `dispute_admin` holds both
 * (ROLE_PERMISSIONS in shared/constants/permissions), which is what makes
 * "admins lose nothing here" true for the role that actually mediates.
 */

import { ADMIN_ROLES, type EscrowAcceptanceMode } from '@tenda/shared'
import type { escrows } from '@tenda/shared/db/schema'
import { isEscrowPartyOrAssignedRow, type EscrowPartyColumns } from '@server/lib/escrow-party'

/**
 * The reader, or `null` for an anonymous one. Only built on routes that ran
 * the full `authenticate`, because `role` is meaningless without it — see the
 * module header.
 */
export interface DetailViewer {
  id: string
  role: string
}

/**
 * Visibility of a taken-down listing (CO1: `escrows.hidden`). A hidden escrow
 * vanishes from public browse/detail but stays visible to its parties (funds
 * may be locked on-chain, they must still operate it) and to any admin role
 * (takedown review).
 *
 * The ONLY gate that reads a role, and both call sites reach it after
 * `fastify.authenticate` has re-read that role from the DB. It decides
 * visibility of the LISTING, not of the private half — an admin who opens a
 * taken-down gig sees what any reader sees, and reads the evidence in the
 * dossier.
 */
export function canViewHiddenEscrow(
  escrow: EscrowPartyColumns,
  viewer: DetailViewer | null,
): boolean {
  if (viewer === null) return false
  if (isEscrowPartyOrAssignedRow(escrow, viewer.id)) return true
  // `some` rather than `ADMIN_ROLES.includes(role as AdminRole)`: the array is
  // typed `readonly AdminRole[]`, so `includes` refuses a plain string and the
  // cast is the only way through. A cast on a ROLE CHECK is the wrong thing to
  // normalise — it asserts exactly what the line is supposed to be testing.
  return ADMIN_ROLES.some((admin) => admin === viewer.role)
}

/** The two columns that describe how an escrow may be taken up. */
export type EscrowAcceptanceColumns = Pick<
  typeof escrows.$inferSelect,
  'assigned_counterparty_id' | 'requires_approval'
>

/**
 * Publish the acceptance mode, splitting WHETHER someone is invited from WHO.
 *
 * The split is the whole point. The assignee's user id IS the worker's identity
 * by another name, and it survives the lifecycle (only `decline` clears it), so
 * publishing it would undo the `counterparty` scoping next door. But withholding
 * it ALONE is worse than useless: `canAccept` would read the absent id as "open
 * to anyone" and offer a stranger an Accept button the chain reverts. So the
 * flag goes to everyone and the id goes to the parties — and because the
 * invitee is a party (`isEscrowPartyOrAssignedRow`), the one person who needs
 * the id to match themselves against it gets it.
 *
 * `is_assigned` is narrower than "taken": an approval-mode escrow is assigned by
 * installing `counterparty_id` and never touches this column, so it reads false
 * at every status. Correct for the one question `canAccept` asks — it returns on
 * `requires_approval` first — and wrong for any other; `status` is what says
 * whether work is under way.
 *
 * Returns `EscrowAcceptanceMode`, the exact shape the client's `canAccept`
 * consumes, so the server's projection and the client's input cannot drift.
 * Shared by both detail routes: the pairing above is subtle enough that a
 * second copy is a second chance to get it wrong, which is precisely how the
 * exchange surface went without it.
 */
export function scopeEscrowAcceptanceMode(
  escrow: EscrowAcceptanceColumns,
  isParty: boolean,
): EscrowAcceptanceMode {
  return {
    requires_approval: escrow.requires_approval,
    is_assigned: escrow.assigned_counterparty_id !== null,
    assigned_counterparty_id: isParty ? escrow.assigned_counterparty_id : null,
  }
}

/** The id + address column pairs the viewer-relative signer read needs. */
export type EscrowSignerAddressColumns = Pick<
  typeof escrows.$inferSelect,
  | 'creator_id'
  | 'counterparty_id'
  | 'assigned_counterparty_id'
  | 'creator_address'
  | 'counterparty_address'
  | 'assigned_counterparty_address'
>

/**
 * The wallet THIS VIEWER is bound to on the escrow — the wire's
 * `my_signer_address`. Chain-attested columns, viewer-relative projection:
 * the creator gets their create-signer, the counterparty their accept-signer,
 * a pending assignee the wallet baked at create. Everyone else — anonymous,
 * stranger, admin — gets `null`, and the OTHER party's address is never
 * offered at all, so "owner only" is a property of the wire shape rather
 * than a client rule.
 *
 * Role precedence mirrors `deriveCaller` (creator → counterparty →
 * assignee): a post-accept row may keep `assigned_counterparty_id`
 * populated, and the accepted wallet is the one that signs from then on.
 * Null columns (drafts, pre-column escrows) answer null — unknown, never
 * guessed from the CURRENT linked set, which can differ from what was baked.
 */
export function scopeMySignerAddress(
  escrow: EscrowSignerAddressColumns,
  viewerId: string | null,
): string | null {
  if (viewerId === null) return null
  if (escrow.creator_id === viewerId) return escrow.creator_address
  if (escrow.counterparty_id === viewerId) return escrow.counterparty_address
  if (escrow.assigned_counterparty_id === viewerId) return escrow.assigned_counterparty_address
  return null
}

/**
 * The private half — the fields both detail routes withhold from a non-party.
 * Generic over the wire types so the one projection serves the gig and
 * exchange shapes without either importing the other's types.
 */
export interface EscrowPrivateFields<TUser, TProof, TDispute> {
  counterparty: TUser | null
  proofs: TProof[]
  dispute: TDispute | null
}

/**
 * Blank the private half for an outsider, pass it through untouched for a
 * party.
 *
 * Blanked rather than omitted: `counterparty: null`, `proofs: []` and
 * `dispute: null` are all states the wire type already has — an unaccepted
 * escrow, one with nothing submitted, one never disputed — so a client reads
 * "withheld" through the code path it already has for "not there yet". An
 * omitted key would instead be a second shape every consumer must learn.
 *
 * Returns a NEW object either way; the caller's input is never mutated.
 */
export function scopeEscrowPrivateFields<TUser, TProof, TDispute>(
  fields: EscrowPrivateFields<TUser, TProof, TDispute>,
  isParty: boolean,
): EscrowPrivateFields<TUser, TProof, TDispute> {
  if (isParty) return { ...fields }
  return { counterparty: null, proofs: [], dispute: null }
}
