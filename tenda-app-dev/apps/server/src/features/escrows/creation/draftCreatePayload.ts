/**
 * A draft row → the adapter's createEscrow payload. ONE mapping for the three
 * places that build a create from a persisted draft — POST /v1/escrows (the
 * replayed or freshly inserted row), build-create and the relayed-funding
 * routes (via prepareDraftCreate) — so the fields a transaction encodes can
 * never drift from the row that records them.
 *
 * Acceptance mode and the unassign window come from the DRAFT ROW, not from
 * config: the row is what that draft was created with, and today's config is
 * not a substitute (see the escrows column comments).
 */
import type { CreateEscrowPayload } from '@server/chains/types'
import type { EscrowRow } from '@server/lib/escrow-routes'

export interface DraftWindows {
  /** The accept deadline the transaction will encode — DERIVED at build from the draft's window (#41), never the instant a caller sent. */
  accept_deadline: Date
  completion_duration_seconds: number
}

/** What the mapping reads — a persisted row, or the columns a draft is about to be inserted with. */
export type DraftSource = Pick<
  EscrowRow,
  'id' | 'kind' | 'asset' | 'amount_raw' | 'assigned_counterparty_id' | 'dispute_bond_raw' | 'requires_approval' | 'unassign_window_seconds' | 'is_seeker'
>

export function draftCreatePayload(escrow: DraftSource, windows: DraftWindows): CreateEscrowPayload {
  return {
    escrow_id: escrow.id,
    kind: escrow.kind,
    asset: escrow.asset,
    amount_raw: escrow.amount_raw,
    ...(escrow.assigned_counterparty_id !== null
      ? { assigned_counterparty_user_id: escrow.assigned_counterparty_id }
      : {}),
    accept_deadline_unix: Math.floor(windows.accept_deadline.getTime() / 1000),
    completion_duration_seconds: windows.completion_duration_seconds,
    dispute_bond_raw: escrow.dispute_bond_raw,
    requires_approval: escrow.requires_approval,
    unassign_window_seconds: escrow.unassign_window_seconds,
    is_seeker: escrow.is_seeker,
  }
}
