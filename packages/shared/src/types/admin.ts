/**
 * Admin-layer types — derived from the DB schema and used by both the server
 * (route annotations) and the admin frontend. Single source of truth.
 */
import type { InferSelectModel } from 'drizzle-orm'
import type {
  platform_config,
  reports,
  announcements,
  admin_audit_log,
  admin_users,
} from '../db/schema'
import type { UserRole, UserStatus } from './user'
import type { EscrowKind, EscrowStatus, EscrowListRow } from './escrow'
import type { GigCategory } from '../constants/categories'
import type { DisputeListAssigned, DisputeListStatus } from '../constants/disputes'
import type { ReportStatus } from '../constants/moderation'
import type { PaginatedResponse } from './api'

// ─── DB row types ─────────────────────────────────────────────────────────────

export type AdminPlatformConfig = InferSelectModel<typeof platform_config>
export type Report = InferSelectModel<typeof reports>
export type Announcement = InferSelectModel<typeof announcements>
export type AdminAuditEntry = InferSelectModel<typeof admin_audit_log>
/** Dashboard-login registry row (#84) — NEVER an authorization source. */
export type AdminUserRow = InferSelectModel<typeof admin_users>

// ─── Admin list rows (custom projections returned by admin list endpoints) ────

/** Unified gig + exchange row for GET /admin/escrows. */
export interface AdminEscrowRow extends EscrowListRow {
  /** Admin takedown flag (CO1) — hidden listings are off the public surfaces. */
  hidden: boolean
  /** gig_details location; null for exchanges. */
  country: string | null
  city: string | null
  creator_first_name: string | null
  creator_last_name: string | null
  /** The escrow's dispute row id (disputed/resolved escrows), else null —
   *  lets the listings row deep-link straight to the dispute. */
  dispute_id: string | null
}

export interface AdminEscrowListQuery {
  offset?: number
  limit?: number
  kind?: EscrowKind
  status?: EscrowStatus
  chain_id?: string
  category?: GigCategory
  country?: string
  creator_id?: string
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UpdateUserStatusBody {
  status: UserStatus
}
export interface UpdateUserRoleBody {
  role: UserRole
}

/**
 * #82 fraud FLAG (admin-only signal, never an automatic restriction) —
 * computed live by the server (features/reputation/fraud-flag.ts) and
 * returned as `dispute_metric` on GET /admin/users/:id + /admin/standing.
 */
export interface DisputeRateMetric {
  /** Terminal escrows the user was party to that had a counterparty. */
  closed_engagements: number
  /** Of those, how many closed through dispute resolution. */
  disputed: number
  /** disputed ÷ closed in basis points; null with zero engagements. */
  dispute_rate_bps: number | null
  /** Strictly above threshold AND at least the minimum volume. */
  fraud_flag: boolean
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface ActionReportBody {
  status: ReportStatus
  admin_note?: string
}

export type { ReportStatus, PaginatedResponse }

// ─── Disputes ────────────────────────────────────────────────────────────────

/**
 * Query accepted by GET /admin/disputes. Every enum-ish member is narrowed
 * server-side and a value outside its vocabulary is a 400, so this MUST stay
 * the single definition — a dashboard-local copy could offer a filter the API
 * refuses. Declared as a `type`, not an `interface`: only a type alias carries
 * the implicit index signature that the caller's `Record`-shaped query
 * serialiser requires.
 */
export type DisputeListQuery = {
  status?: DisputeListStatus
  kind?: EscrowKind
  assigned?: DisputeListAssigned
  /** Filter to disputes where this user is a party (user-detail cross-link). */
  party?: string
  limit?: number
  offset?: number
}

/** Normalised row returned by GET /admin/disputes (v2 single dispute table). */
export interface DisputeSummary {
  dispute_id: string
  escrow_id: string
  kind: EscrowKind
  /** gig_details.title for gigs; null for exchanges. */
  subject_title: string | null
  raised_by_id: string
  raised_by_first_name: string | null
  raised_by_last_name: string | null
  reason: string
  /** Mediating admin (CO7 claim-based assignment); null while unclaimed. */
  assigned_to_id: string | null
  /** Mediator's name, so the queue says WHICH colleague holds a case. */
  assigned_to_first_name: string | null
  assigned_to_last_name: string | null
  assigned_at: string | null
  winner: 'creator' | 'counterparty' | 'split' | null
  /**
   * Author of the VERDICT — the mediator whose proposal confirmed on chain,
   * copied from dispute_resolutions.proposed_by by the settlement path. Not
   * the signer: signing is a separate permission (disputes.execute) using the
   * chain's shared dispute-authority key, and that admin is recorded on the
   * tx_attempts row instead. Null when the resolution bypassed the propose
   * flow (CLI/direct-resolve) and on disputes resolved before this was
   * stamped — historic rows are not backfilled.
   */
  resolved_by_id: string | null
  /** Resolver's name; null whenever resolved_by_id is, for the reasons above. */
  resolved_by_first_name: string | null
  resolved_by_last_name: string | null
  resolved_at: string | null
  raised_at: string | null
}

// ─── Featured slots (CO8) ────────────────────────────────────────────────────

/** Wire row for GET /admin/featured (Date → ISO; gig title joined). */
export interface FeaturedSlotRow {
  id: string
  escrow_id: string
  starts_at: string
  ends_at: string
  position: number
  created_by: string | null
  created_at: string
  /** gig_details.title of the featured listing. */
  title: string | null
}

export interface CreateFeaturedSlotBody {
  escrow_id: string
  /** ISO timestamps; ends_at must be after starts_at. */
  starts_at: string
  ends_at: string
  position?: number
}

export interface UpdateFeaturedSlotBody {
  starts_at?: string
  ends_at?: string
  position?: number
}

// ─── Platform config ─────────────────────────────────────────────────────────

/**
 * The editable subset of `platform_config` — the single source shared by the
 * PATCH route, the admin client and the config form.
 *
 * It previously advertised `approval_window_seconds` and
 * `default_sponsored_tx_count`, which the route has never accepted; both are
 * read-only in the dashboard. Anything listed here must be handled by
 * `routes/v1/admin/platform-config.ts`.
 */
export interface UpdatePlatformConfigBody {
  fee_bps?: number
  seeker_fee_bps?: number
  grace_period_seconds?: number
  max_pending_gigs?: number
  unassign_window_seconds?: number
  max_open_applications?: number
  application_ttl_seconds?: number
}

// ─── Announcements ───────────────────────────────────────────────────────────

export interface CreateAnnouncementBody {
  title: string
  body: string
  priority?: number
  is_active?: boolean
  expires_at?: string
}

export interface UpdateAnnouncementBody {
  title?: string
  body?: string
  priority?: number
  is_active?: boolean
  expires_at?: string | null
}

// ─── Push notifications ──────────────────────────────────────────────────────

export type PushBroadcastTarget = 'all' | 'role' | 'country' | 'city'

export interface BroadcastPushBody {
  title: string
  body: string
  target: PushBroadcastTarget
  target_value?: string
  data?: Record<string, string>
}

export interface BroadcastPushResponse {
  attempted: number
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export interface FinanceFeeRow {
  type: string
  transaction_count: number
  total_platform_fee: string
  total_amount: string
}

export interface FinanceFeeSummary {
  by_type: FinanceFeeRow[]
  total_fee_raw: string
}

export interface FinanceFeesResponse {
  period: { from: string; to: string }
  by_kind: Record<EscrowKind, FinanceFeeSummary>
  grand_total_fee_raw: string
}
