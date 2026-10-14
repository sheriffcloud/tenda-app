/**
 * The admin dashboard's wire contract: every route in `adminRoutes`
 * (api/admin-routes.ts) mapped to its params, body, query and RESPONSE.
 *
 * WHY IT EXISTS. The dashboard typed responses by hand (`api.get<{...}>`), and the server
 * answered some of its routes as `Reply: unknown`, so nothing compared the two. Reading
 * them against each other found real drift: the client declared `phone_e164` on a user the
 * users table has never carried, took `fiat/providers/:id` for a provider row when the
 * route answers `{ provider }`, and called the force-settle and refund answers `unknown`
 * when they are `{ intent }`. This file is the one place those shapes now live; the server
 * types its replies against it and the dashboard types its calls from it, so a change on
 * either side is a compile error on the other.
 *
 * Shaped like every sibling contract (`Endpoint<Method, Params, Body, Query, Response>`),
 * with ONE difference: a route key that serves two methods (`disputes.resolution`,
 * `platformConfig`) holds one Endpoint per method instead of one Endpoint, because the
 * route MAP keeps a single URL under a single key. The shape parity with `adminRoutes` is
 * asserted at compile time in test/api/admin-contract.test.ts.
 *
 * Not part of `ApiContract`: that is what web and mobile call, and neither has any use for
 * these. Reach it by name (`AdminContract`) from the barrel; it costs nothing at runtime.
 */
import type { Endpoint } from '../endpoint'
import type {
  ActionReportBody,
  AdminEscrowDossier,
  AdminEscrowListQuery,
  AdminEscrowRow,
  AdminFiatIntentRow,
  AdminFiatProviderRow,
  AdminMetrics,
  AdminPlatformConfig,
  AdminResolutionView,
  AdminSendEmailOtpResponse,
  AdminUserDetail,
  AdminUserListRow,
  AdminUserRoleResult,
  AdminUserStatusResult,
  AdminVerifyEmailOtpResponse,
  Announcement,
  BroadcastPushBody,
  BroadcastPushResponse,
  CreateAnnouncementBody,
  CreateFeaturedSlotBody,
  DisputeListQuery,
  DisputeMessage,
  DisputeRateMetric,
  DisputeResolution,
  DisputeSummary,
  DisputeThreadResponse,
  FeaturedSlotRow,
  FinanceFeesResponse,
  ModerationVerdictRow,
  PaginatedResponse,
  Report,
  ReportStatus,
  ResolutionExecuteBuild,
  ResolutionQueueRow,
  ResolutionStatus,
  ResolutionWinner,
  UpdateAnnouncementBody,
  UpdateFeaturedSlotBody,
  UpdatePlatformConfigBody,
  UserRole,
  UserStatus,
  Wire,
} from '../../types'

type Id = { id: string }
type Paged = { limit?: number; offset?: number }

/** The listing envelope the unpaginated-type routes build by hand: `{ data, total, limit, offset }`. */
export type AdminPage<T> = PaginatedResponse<T>

export interface AdminContract {
  auth: {
    sendEmailOtp: Endpoint<'POST', undefined, { email: string }, undefined, AdminSendEmailOtpResponse>
    verifyEmailOtp: Endpoint<'POST', undefined, { email: string; code: string }, undefined, AdminVerifyEmailOtpResponse>
  }
  users: {
    list: Endpoint<'GET', undefined, undefined, { status?: UserStatus; role?: UserRole; search?: string } & Paged, AdminPage<AdminUserListRow>>
    get: Endpoint<'GET', Id, undefined, undefined, AdminUserDetail>
    updateStatus: Endpoint<'PATCH', Id, { status: UserStatus }, undefined, AdminUserStatusResult>
    updateRole: Endpoint<'PATCH', Id, { role: UserRole }, undefined, AdminUserRoleResult>
    grantLoginEmail: Endpoint<'PUT', Id, { email: string }, undefined, { user_id: string; email: string; role: string }>
    revokeLoginEmail: Endpoint<'DELETE', Id, undefined, undefined, { user_id: string; revoked: boolean }>
  }
  escrows: {
    list: Endpoint<'GET', undefined, undefined, AdminEscrowListQuery, AdminPage<AdminEscrowRow>>
    dossier: Endpoint<'GET', Id, undefined, undefined, AdminEscrowDossier>
    setHidden: Endpoint<'PATCH', Id, { hidden: boolean }, undefined, { id: string; hidden: boolean }>
  }
  disputes: {
    list: Endpoint<'GET', undefined, undefined, DisputeListQuery, AdminPage<DisputeSummary>>
    get: Endpoint<'GET', Id, undefined, undefined, DisputeSummary>
    claim: Endpoint<'POST', Id, undefined, undefined, { id: string; assigned_to_id: string }>
    release: Endpoint<'POST', Id, undefined, undefined, { id: string; assigned_to_id: null }>
    /** One URL, two methods: the latest proposed resolution, and proposing one. */
    resolution: {
      GET: Endpoint<'GET', Id, undefined, undefined, AdminResolutionView | null>
      POST: Endpoint<'POST', Id, { winner: ResolutionWinner }, undefined, DisputeResolution>
    }
  }
  resolutions: {
    list: Endpoint<'GET', undefined, undefined, { status?: ResolutionStatus } & Paged, AdminPage<ResolutionQueueRow>>
    reject: Endpoint<'POST', Id, { reason: string }, undefined, DisputeResolution>
    executeBuild: Endpoint<'POST', Id, undefined, undefined, ResolutionExecuteBuild>
    broadcast: Endpoint<'POST', Id, { tx_ref: string }, undefined, { status: string }>
  }
  disputeThread: {
    /** The thread rides the ESCROW id, shared with the parties' app. GET reads, POST sends. */
    messages: {
      GET: Endpoint<'GET', Id, undefined, { after?: string }, DisputeThreadResponse>
      POST: Endpoint<'POST', Id, { body: string }, undefined, DisputeMessage>
    }
  }
  reports: {
    list: Endpoint<'GET', undefined, undefined, { status?: ReportStatus; content_type?: string } & Paged, AdminPage<Wire<Report>>>
    action: Endpoint<'PATCH', Id, ActionReportBody, undefined, Wire<Report>>
  }
  featured: {
    list: Endpoint<'GET', undefined, undefined, undefined, { data: FeaturedSlotRow[] }>
    create: Endpoint<'POST', undefined, CreateFeaturedSlotBody, undefined, FeaturedSlotRow>
    update: Endpoint<'PATCH', Id, UpdateFeaturedSlotBody, undefined, FeaturedSlotRow>
    remove: Endpoint<'DELETE', Id, undefined, undefined, { deleted: true }>
  }
  standing: {
    get: Endpoint<'GET', { user_id: string }, undefined, undefined, { standing: unknown; dispute_metric: DisputeRateMetric }>
    override: Endpoint<'POST', { user_id: string }, { action: string; reason: string }, undefined, unknown>
  }
  platformConfig: {
    GET: Endpoint<'GET', undefined, undefined, undefined, Wire<AdminPlatformConfig>>
    PATCH: Endpoint<'PATCH', undefined, UpdatePlatformConfigBody, undefined, Wire<AdminPlatformConfig>>
  }
  announcements: {
    list: Endpoint<'GET', undefined, undefined, { active?: string } & Paged, AdminPage<Wire<Announcement>>>
    create: Endpoint<'POST', undefined, CreateAnnouncementBody, undefined, Wire<Announcement>>
    update: Endpoint<'PATCH', Id, UpdateAnnouncementBody, undefined, Wire<Announcement>>
    remove: Endpoint<'DELETE', Id, undefined, undefined, { id: string }>
  }
  moderation: {
    verdicts: Endpoint<'GET', undefined, undefined, { decision?: string; page?: number }, { verdicts: ModerationVerdictRow[]; page: number }>
    override: Endpoint<'POST', Id, { reason: string }, undefined, { override_id: string | undefined; original_id: string }>
  }
  finance: {
    fees: Endpoint<'GET', undefined, undefined, { from?: string; to?: string }, FinanceFeesResponse>
  }
  metrics: Endpoint<'GET', undefined, undefined, undefined, { metrics: AdminMetrics }>
  fiat: {
    intents: Endpoint<'GET', undefined, undefined, { status?: string; provider?: string; user_id?: string }, { intents: AdminFiatIntentRow[] }>
    forceSettle: Endpoint<'POST', Id, { reason: string }, undefined, { intent: AdminFiatIntentRow }>
    refund: Endpoint<'POST', Id, { reason: string }, undefined, { intent: AdminFiatIntentRow }>
    providers: Endpoint<'GET', undefined, undefined, undefined, { providers: AdminFiatProviderRow[] }>
    updateProvider: Endpoint<'PATCH', Id, { is_enabled?: boolean; priority?: number }, undefined, { provider: AdminFiatProviderRow }>
  }
  push: {
    broadcast: Endpoint<'POST', undefined, BroadcastPushBody, undefined, BroadcastPushResponse>
  }
}
