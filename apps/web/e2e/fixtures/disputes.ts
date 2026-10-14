/**
 * Dispute world for the e2e stub: one OPEN dispute and one RESOLVED one, so
 * the Open|Resolved buckets are actually distinguishable — a single row in one
 * of them would let a column that ignores `?status=` pass.
 *
 * Typed against the real wire types, like every other fixture here: a shape
 * the server cannot produce is a test that proves nothing.
 */
import type { MyDisputeRow, MyDisputeStatus, PaginatedResponse } from '@tenda/shared'
import { EXISTING_USER_ID } from './auth'

export const OPEN_DISPUTE: MyDisputeRow = {
  dispute_id: 'dsp-open-1',
  escrow_id: 'gig-delivery-1',
  kind: 'gig',
  subject_title: 'Deliver a parcel across Yaba',
  status: 'disputed',
  my_role: 'creator',
  counterparty_name: 'Bola Ade',
  reason: 'The parcel never arrived at the address on the listing.',
  raised_at: '2026-08-15T10:00:00.000Z',
  winner: null,
  resolved_at: null,
  raised_by_me: true,
}

export const RESOLVED_DISPUTE: MyDisputeRow = {
  dispute_id: 'dsp-resolved-1',
  escrow_id: 'gig-photo-9',
  kind: 'gig',
  subject_title: 'Half-day photo coverage in Westlands',
  status: 'resolved',
  my_role: 'counterparty',
  counterparty_name: 'Ife Adeyemi',
  reason: 'Half the gallery was never delivered.',
  raised_at: '2026-08-10T08:00:00.000Z',
  winner: 'counterparty',
  resolved_at: '2026-08-12T09:30:00.000Z',
  raised_by_me: false,
}

const BUCKETS: Record<MyDisputeStatus, MyDisputeRow[]> = {
  open: [OPEN_DISPUTE],
  resolved: [RESOLVED_DISPUTE],
}

/** GET /v1/disputes?status=… — the only dispute route the list needs. */
export function handleDisputes(
  url: URL,
  method: string,
  callerId: string,
): { payload: PaginatedResponse<MyDisputeRow>; statusCode: number } | null {
  if (method !== 'GET' || url.pathname !== '/v1/disputes') return null
  // Only the seeded account has disputes. The real route scopes by party, and
  // a stub that answers the same rows to every bearer would let a test asking
  // "does the next account see these?" pass on the fixture's behaviour.
  if (callerId !== EXISTING_USER_ID) {
    return { payload: { data: [], total: 0, limit: 20, offset: 0 }, statusCode: 200 }
  }
  const status: MyDisputeStatus = url.searchParams.get('status') === 'resolved' ? 'resolved' : 'open'
  const rows = BUCKETS[status]
  const limit = Number(url.searchParams.get('limit') ?? 20)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  return {
    payload: { data: rows.slice(offset, offset + limit), total: rows.length, limit, offset },
    statusCode: 200,
  }
}
