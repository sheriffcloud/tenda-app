/**
 * Typed v2 admin API client (#90). Thin: paths from api/routes.ts, HTTP
 * core from lib/api.ts (bearer header + 401 logout). Namespaces grow with
 * the dashboard build order — #91 disputes, #92 reports/users, #93 ops —
 * so every method here maps to a route that EXISTS on the server today.
 */

import type {
  ActionReportBody,
  AdminEscrowDossier,
  AdminEscrowRow,
  AdminPlatformConfig,
  UpdatePlatformConfigBody,
  Announcement,
  BroadcastPushBody,
  CreateAnnouncementBody,
  AdminResolutionView,
  CreateFeaturedSlotBody,
  DisputeListQuery,
  DisputeMessage,
  DisputeRateMetric,
  DisputeResolution,
  DisputeSummary,
  DisputeThreadResponse,
  FeaturedSlotRow,
  FinanceFeesResponse,
  PaginatedResponse,
  ResolutionExecuteBuild,
  ResolutionQueueRow,
  ResolutionStatus,
  ResolutionWinner,
  Report,
  ReportStatus,
  UpdateAnnouncementBody,
  UpdateFeaturedSlotBody,
  UserRole,
  UserStatus,
} from '@tenda/shared'
import type { AdminSessionUser } from '@/lib/auth'
import { api } from '@/lib/api'
import { adminRoutes, buildPath } from './routes'

export interface VerifyEmailOtpResponse {
  token: string
  /** JWT lifetime as a duration string ('12h') — the send route's
   * `expires_in` is the CODE lifetime in seconds; distinct names on purpose. */
  token_ttl: string
  user: AdminSessionUser
}

// types (not interfaces): keeps the implicit index signature Record needs.
export type ReportListQuery = {
  status?: ReportStatus
  content_type?: string
  limit?: number
  offset?: number
}

export type EscrowListAdminQuery = {
  kind?: 'gig' | 'exchange'
  status?: string
  chain_id?: string
  category?: string
  country?: string
  creator_id?: string
  limit?: number
  offset?: number
}

export type UserListQuery = {
  status?: UserStatus
  role?: UserRole
  search?: string
  limit?: number
  offset?: number
}

/** Projection returned by GET /v1/admin/users (route-local on the server). */
export interface AdminUserListRow {
  id: string
  first_name: string
  last_name: string
  role: UserRole
  status: UserStatus
  is_seeker: boolean
  country: string | null
  city: string | null
  review_score: string | null
  created_at: string
  last_active_at: string | null
}

/** Full users row + the #82 fraud-flag metric. */
export interface AdminUserDetail extends AdminUserListRow {
  bio: string | null
  avatar_url: string | null
  phone_e164: string | null
  advanced_mode_enabled: boolean
  dispute_metric: DisputeRateMetric
}

/** Stage-6 verdict row (route returns the full table row). */
export interface ModerationVerdictRow {
  id: string
  subject_kind: string
  subject_id: string | null
  decision: 'approve' | 'warn' | 'block'
  reasons: unknown
  provider: string
  model: string | null
  cost_usd: string | null
  latency_ms: number | null
  created_at: string
}

/** Stage-8 intent row — the display subset of fiat_intents. */
export interface FiatIntentRow {
  id: string
  user_id: string
  direction: 'onramp' | 'offramp'
  provider: string
  status: string
  fiat_currency: string
  fiat_amount: string
  asset: string
  asset_amount_raw: string
  created_at: string
}

export interface FiatProviderRow {
  id: string
  display_name: string
  priority: number
  is_enabled: boolean
}

export interface AdminMetrics {
  total_users: number
  active_24h: number
  active_7d: number
  active_30d: number
  suspended: number
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) q.set(key, String(value))
  }
  const qs = q.toString()
  return qs === '' ? path : `${path}?${qs}`
}

export const adminApi = {
  auth: {
    sendEmailOtp: (body: { email: string }) =>
      api.post<{ sent: boolean; expires_in: number }>(adminRoutes.auth.sendEmailOtp, body),
    verifyEmailOtp: (body: { email: string; code: string }) =>
      api.post<VerifyEmailOtpResponse>(adminRoutes.auth.verifyEmailOtp, body),
  },
  disputes: {
    list: (query: DisputeListQuery = {}) =>
      api.get<PaginatedResponse<DisputeSummary>>(withQuery(adminRoutes.disputes.list, query)),
    get: (id: string) => api.get<DisputeSummary>(buildPath(adminRoutes.disputes.get, { id })),
    claim: (id: string) =>
      api.post<{ id: string; assigned_to_id: string }>(
        buildPath(adminRoutes.disputes.claim, { id }),
      ),
    release: (id: string) =>
      api.post<{ id: string; assigned_to_id: null }>(
        buildPath(adminRoutes.disputes.release, { id }),
      ),
    getResolution: (id: string) =>
      api.get<AdminResolutionView | null>(buildPath(adminRoutes.disputes.resolution, { id })),
    propose: (id: string, winner: ResolutionWinner) =>
      api.post<DisputeResolution>(buildPath(adminRoutes.disputes.resolution, { id }), { winner }),
  },
  resolutions: {
    queue: (query: { status?: ResolutionStatus; limit?: number; offset?: number } = {}) =>
      api.get<PaginatedResponse<ResolutionQueueRow>>(withQuery(adminRoutes.resolutions.list, query)),
    reject: (id: string, reason: string) =>
      api.post<DisputeResolution>(buildPath(adminRoutes.resolutions.reject, { id }), { reason }),
    executeBuild: (id: string) =>
      api.post<ResolutionExecuteBuild>(buildPath(adminRoutes.resolutions.executeBuild, { id })),
    broadcast: (id: string, tx_ref: string) =>
      api.post<{ status: string }>(buildPath(adminRoutes.resolutions.broadcast, { id }), { tx_ref }),
  },
  disputeThread: {
    /** Thread rides the ESCROW id (shared with the parties' app). */
    get: (escrowId: string, after?: string) =>
      api.get<DisputeThreadResponse>(
        withQuery(buildPath(adminRoutes.disputeThread.messages, { id: escrowId }), { after }),
      ),
    send: (escrowId: string, body: string) =>
      api.post<DisputeMessage>(buildPath(adminRoutes.disputeThread.messages, { id: escrowId }), {
        body,
      }),
  },
  reports: {
    list: (query: ReportListQuery = {}) =>
      api.get<PaginatedResponse<Report>>(withQuery(adminRoutes.reports.list, query)),
    action: (id: string, body: ActionReportBody) =>
      api.patch<Report>(buildPath(adminRoutes.reports.action, { id }), body),
  },
  escrows: {
    list: (query: EscrowListAdminQuery = {}) =>
      api.get<PaginatedResponse<AdminEscrowRow>>(withQuery(adminRoutes.escrows.list, query)),
    dossier: (id: string) =>
      api.get<AdminEscrowDossier>(buildPath(adminRoutes.escrows.dossier, { id })),
    setHidden: (id: string, hidden: boolean) =>
      api.patch<{ id: string; hidden: boolean }>(
        buildPath(adminRoutes.escrows.setHidden, { id }),
        { hidden },
      ),
  },
  adminUsers: {
    list: (query: UserListQuery = {}) =>
      api.get<PaginatedResponse<AdminUserListRow>>(withQuery(adminRoutes.users.list, query)),
    get: (id: string) =>
      api.get<AdminUserDetail>(buildPath(adminRoutes.users.get, { id })),
    updateStatus: (id: string, status: UserStatus) =>
      api.patch<{ id: string; status: string }>(
        buildPath(adminRoutes.users.updateStatus, { id }),
        { status },
      ),
    updateRole: (id: string, role: UserRole) =>
      api.patch<{ id: string; role: string }>(buildPath(adminRoutes.users.updateRole, { id }), {
        role,
      }),
    grantLoginEmail: (id: string, email: string) =>
      api.put<{ user_id: string; email: string; role: string }>(
        buildPath(adminRoutes.users.grantLoginEmail, { id }),
        { email },
      ),
    revokeLoginEmail: (id: string) =>
      api.delete<{ user_id: string; revoked: boolean }>(
        buildPath(adminRoutes.users.revokeLoginEmail, { id }),
      ),
  },
  featured: {
    list: () => api.get<{ data: FeaturedSlotRow[] }>(adminRoutes.featured.list),
    create: (body: CreateFeaturedSlotBody) =>
      api.post<FeaturedSlotRow>(adminRoutes.featured.create, body),
    update: (id: string, body: UpdateFeaturedSlotBody) =>
      api.patch<FeaturedSlotRow>(buildPath(adminRoutes.featured.update, { id }), body),
    remove: (id: string) =>
      api.delete<{ deleted: true }>(buildPath(adminRoutes.featured.remove, { id })),
  },
  platformConfig: {
    get: () => api.get<AdminPlatformConfig>(adminRoutes.platformConfig),
    update: (body: UpdatePlatformConfigBody) =>
      api.patch<AdminPlatformConfig>(adminRoutes.platformConfig, body),
  },
  announcements: {
    list: (query: { limit?: number; offset?: number; active?: string } = {}) =>
      api.get<PaginatedResponse<Announcement>>(withQuery(adminRoutes.announcements.list, query)),
    create: (body: CreateAnnouncementBody) =>
      api.post<Announcement>(adminRoutes.announcements.create, body),
    update: (id: string, body: UpdateAnnouncementBody) =>
      api.patch<Announcement>(buildPath(adminRoutes.announcements.update, { id }), body),
    remove: (id: string) =>
      api.delete<{ id: string }>(buildPath(adminRoutes.announcements.remove, { id })),
  },
  moderation: {
    verdicts: (query: { decision?: string; page?: number } = {}) =>
      api.get<{ verdicts: ModerationVerdictRow[]; page: number }>(
        withQuery(adminRoutes.moderation.verdicts, query),
      ),
    override: (id: string, reason: string) =>
      api.post<unknown>(buildPath(adminRoutes.moderation.override, { id }), { reason }),
  },
  finance: {
    fees: (query: { from?: string; to?: string } = {}) =>
      api.get<FinanceFeesResponse>(withQuery(adminRoutes.finance.fees, query)),
  },
  metrics: {
    get: () => api.get<{ metrics: AdminMetrics }>(adminRoutes.metrics),
  },
  fiat: {
    intents: (query: { status?: string; provider?: string; user_id?: string } = {}) =>
      api.get<{ intents: FiatIntentRow[] }>(withQuery(adminRoutes.fiat.intents, query)),
    forceSettle: (id: string, reason: string) =>
      api.post<unknown>(buildPath(adminRoutes.fiat.forceSettle, { id }), { reason }),
    refund: (id: string, reason: string) =>
      api.post<unknown>(buildPath(adminRoutes.fiat.refund, { id }), { reason }),
    providers: () => api.get<{ providers: FiatProviderRow[] }>(adminRoutes.fiat.providers),
    updateProvider: (id: string, body: { is_enabled?: boolean; priority?: number }) =>
      api.patch<FiatProviderRow>(buildPath(adminRoutes.fiat.updateProvider, { id }), body),
  },
  push: {
    broadcast: (body: BroadcastPushBody) =>
      api.post<{ attempted: number }>(adminRoutes.push.broadcast, body),
  },
}
