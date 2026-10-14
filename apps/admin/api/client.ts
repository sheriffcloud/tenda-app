/**
 * Typed v2 admin API client (#90). Thin: paths from api/routes.ts, HTTP
 * core from lib/api.ts (bearer header + 401 logout). Namespaces grow with
 * the dashboard build order — #91 disputes, #92 reports/users, #93 ops —
 * so every method here maps to a route that EXISTS on the server today.
 *
 * EVERY RESPONSE TYPE COMES FROM `AdminContract` (@tenda/shared), the same
 * contract the server types its replies against. Nothing here is typed by hand:
 * a hand-typed `api.get<{...}>` is what let this client declare a phone number
 * no user row has, take a provider update for a provider row when the route
 * answers `{ provider }`, and call the force-settle answer `unknown`. A test
 * (test/api/client-types.test.ts) fails if an inline response type returns.
 */

import type {
  AdminContract,
  AdminFiatIntentRow,
  AdminFiatProviderRow,
  AdminMetrics,
  AdminUserDetail,
  AdminUserListRow,
  AdminVerifyEmailOtpResponse,
  Announcement,
  ModerationVerdictRow,
  Report,
  Wire,
} from '@tenda/shared'
import { api } from '@/lib/api'
import { adminRoutes, buildPath } from './routes'

type Admin = AdminContract
/** The response of one contract endpoint. */
type Res<E extends { response: unknown }> = E['response']

export type VerifyEmailOtpResponse = AdminVerifyEmailOtpResponse
export type { AdminMetrics, AdminUserDetail, AdminUserListRow, ModerationVerdictRow }
/** A report / announcement AS A CLIENT RECEIVES IT: dates are ISO strings, not the `Date`s the table model says. */
export type ReportRow = Wire<Report>
export type AnnouncementRow = Wire<Announcement>
export type FiatIntentRow = AdminFiatIntentRow
export type FiatProviderRow = AdminFiatProviderRow

// types (not interfaces): keeps the implicit index signature Record needs.
export type ReportListQuery = Admin['reports']['list']['query']
export type EscrowListAdminQuery = Admin['escrows']['list']['query']
export type UserListQuery = Admin['users']['list']['query']

function withQuery(path: string, params: object): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) q.set(key, String(value))
  }
  const qs = q.toString()
  return qs === '' ? path : `${path}?${qs}`
}

export const adminApi = {
  auth: {
    sendEmailOtp: (body: Admin['auth']['sendEmailOtp']['body']) =>
      api.post<Res<Admin['auth']['sendEmailOtp']>>(adminRoutes.auth.sendEmailOtp, body),
    verifyEmailOtp: (body: Admin['auth']['verifyEmailOtp']['body']) =>
      api.post<Res<Admin['auth']['verifyEmailOtp']>>(adminRoutes.auth.verifyEmailOtp, body),
  },
  disputes: {
    list: (query: Admin['disputes']['list']['query'] = {}) =>
      api.get<Res<Admin['disputes']['list']>>(withQuery(adminRoutes.disputes.list, query)),
    get: (id: string) => api.get<Res<Admin['disputes']['get']>>(buildPath(adminRoutes.disputes.get, { id })),
    claim: (id: string) =>
      api.post<Res<Admin['disputes']['claim']>>(buildPath(adminRoutes.disputes.claim, { id })),
    release: (id: string) =>
      api.post<Res<Admin['disputes']['release']>>(buildPath(adminRoutes.disputes.release, { id })),
    getResolution: (id: string) =>
      api.get<Res<Admin['disputes']['resolution']['GET']>>(buildPath(adminRoutes.disputes.resolution, { id })),
    propose: (id: string, winner: Admin['disputes']['resolution']['POST']['body']['winner']) =>
      api.post<Res<Admin['disputes']['resolution']['POST']>>(buildPath(adminRoutes.disputes.resolution, { id }), { winner }),
  },
  resolutions: {
    queue: (query: Admin['resolutions']['list']['query'] = {}) =>
      api.get<Res<Admin['resolutions']['list']>>(withQuery(adminRoutes.resolutions.list, query)),
    reject: (id: string, reason: string) =>
      api.post<Res<Admin['resolutions']['reject']>>(buildPath(adminRoutes.resolutions.reject, { id }), { reason }),
    executeBuild: (id: string) =>
      api.post<Res<Admin['resolutions']['executeBuild']>>(buildPath(adminRoutes.resolutions.executeBuild, { id })),
    broadcast: (id: string, tx_ref: string) =>
      api.post<Res<Admin['resolutions']['broadcast']>>(buildPath(adminRoutes.resolutions.broadcast, { id }), { tx_ref }),
  },
  disputeThread: {
    /** Thread rides the ESCROW id (shared with the parties' app). */
    get: (escrowId: string, after?: string) =>
      api.get<Res<Admin['disputeThread']['messages']['GET']>>(
        withQuery(buildPath(adminRoutes.disputeThread.messages, { id: escrowId }), { after }),
      ),
    send: (escrowId: string, body: string) =>
      api.post<Res<Admin['disputeThread']['messages']['POST']>>(
        buildPath(adminRoutes.disputeThread.messages, { id: escrowId }),
        { body },
      ),
  },
  reports: {
    list: (query: ReportListQuery = {}) =>
      api.get<Res<Admin['reports']['list']>>(withQuery(adminRoutes.reports.list, query)),
    action: (id: string, body: Admin['reports']['action']['body']) =>
      api.patch<Res<Admin['reports']['action']>>(buildPath(adminRoutes.reports.action, { id }), body),
  },
  escrows: {
    list: (query: EscrowListAdminQuery = {}) =>
      api.get<Res<Admin['escrows']['list']>>(withQuery(adminRoutes.escrows.list, query)),
    dossier: (id: string) =>
      api.get<Res<Admin['escrows']['dossier']>>(buildPath(adminRoutes.escrows.dossier, { id })),
    setHidden: (id: string, hidden: boolean) =>
      api.patch<Res<Admin['escrows']['setHidden']>>(buildPath(adminRoutes.escrows.setHidden, { id }), { hidden }),
  },
  adminUsers: {
    list: (query: UserListQuery = {}) =>
      api.get<Res<Admin['users']['list']>>(withQuery(adminRoutes.users.list, query)),
    get: (id: string) =>
      api.get<Res<Admin['users']['get']>>(buildPath(adminRoutes.users.get, { id })),
    updateStatus: (id: string, status: Admin['users']['updateStatus']['body']['status']) =>
      api.patch<Res<Admin['users']['updateStatus']>>(buildPath(adminRoutes.users.updateStatus, { id }), { status }),
    updateRole: (id: string, role: Admin['users']['updateRole']['body']['role']) =>
      api.patch<Res<Admin['users']['updateRole']>>(buildPath(adminRoutes.users.updateRole, { id }), { role }),
    grantLoginEmail: (id: string, email: string) =>
      api.put<Res<Admin['users']['grantLoginEmail']>>(buildPath(adminRoutes.users.grantLoginEmail, { id }), { email }),
    revokeLoginEmail: (id: string) =>
      api.delete<Res<Admin['users']['revokeLoginEmail']>>(buildPath(adminRoutes.users.revokeLoginEmail, { id })),
  },
  featured: {
    list: () => api.get<Res<Admin['featured']['list']>>(adminRoutes.featured.list),
    create: (body: Admin['featured']['create']['body']) =>
      api.post<Res<Admin['featured']['create']>>(adminRoutes.featured.create, body),
    update: (id: string, body: Admin['featured']['update']['body']) =>
      api.patch<Res<Admin['featured']['update']>>(buildPath(adminRoutes.featured.update, { id }), body),
    remove: (id: string) =>
      api.delete<Res<Admin['featured']['remove']>>(buildPath(adminRoutes.featured.remove, { id })),
  },
  platformConfig: {
    get: () => api.get<Res<Admin['platformConfig']['GET']>>(adminRoutes.platformConfig),
    update: (body: Admin['platformConfig']['PATCH']['body']) =>
      api.patch<Res<Admin['platformConfig']['PATCH']>>(adminRoutes.platformConfig, body),
  },
  announcements: {
    list: (query: Admin['announcements']['list']['query'] = {}) =>
      api.get<Res<Admin['announcements']['list']>>(withQuery(adminRoutes.announcements.list, query)),
    create: (body: Admin['announcements']['create']['body']) =>
      api.post<Res<Admin['announcements']['create']>>(adminRoutes.announcements.create, body),
    update: (id: string, body: Admin['announcements']['update']['body']) =>
      api.patch<Res<Admin['announcements']['update']>>(buildPath(adminRoutes.announcements.update, { id }), body),
    remove: (id: string) =>
      api.delete<Res<Admin['announcements']['remove']>>(buildPath(adminRoutes.announcements.remove, { id })),
  },
  moderation: {
    verdicts: (query: Admin['moderation']['verdicts']['query'] = {}) =>
      api.get<Res<Admin['moderation']['verdicts']>>(withQuery(adminRoutes.moderation.verdicts, query)),
    override: (id: string, reason: string) =>
      api.post<Res<Admin['moderation']['override']>>(buildPath(adminRoutes.moderation.override, { id }), { reason }),
  },
  finance: {
    fees: (query: Admin['finance']['fees']['query'] = {}) =>
      api.get<Res<Admin['finance']['fees']>>(withQuery(adminRoutes.finance.fees, query)),
  },
  metrics: {
    get: () => api.get<Res<Admin['metrics']>>(adminRoutes.metrics),
  },
  fiat: {
    intents: (query: Admin['fiat']['intents']['query'] = {}) =>
      api.get<Res<Admin['fiat']['intents']>>(withQuery(adminRoutes.fiat.intents, query)),
    forceSettle: (id: string, reason: string) =>
      api.post<Res<Admin['fiat']['forceSettle']>>(buildPath(adminRoutes.fiat.forceSettle, { id }), { reason }),
    refund: (id: string, reason: string) =>
      api.post<Res<Admin['fiat']['refund']>>(buildPath(adminRoutes.fiat.refund, { id }), { reason }),
    providers: () => api.get<Res<Admin['fiat']['providers']>>(adminRoutes.fiat.providers),
    updateProvider: (id: string, body: Admin['fiat']['updateProvider']['body']) =>
      api.patch<Res<Admin['fiat']['updateProvider']>>(buildPath(adminRoutes.fiat.updateProvider, { id }), body),
  },
  push: {
    broadcast: (body: Admin['push']['broadcast']['body']) =>
      api.post<Res<Admin['push']['broadcast']>>(adminRoutes.push.broadcast, body),
  },
}
