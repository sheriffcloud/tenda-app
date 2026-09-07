/**
 * v2 admin route paths (#90) — only surfaces that EXIST on the server.
 * Path params use :placeholders resolved by api/client.ts buildPath.
 */
export const adminRoutes = {
  auth: {
    sendEmailOtp: '/v1/auth/admin/send-email-otp',
    verifyEmailOtp: '/v1/auth/admin/verify-email-otp',
  },
  users: {
    list: '/v1/admin/users',
    get: '/v1/admin/users/:id',
    updateStatus: '/v1/admin/users/:id/status',
    updateRole: '/v1/admin/users/:id/role',
    grantLoginEmail: '/v1/admin/users/:id/login-email',
    revokeLoginEmail: '/v1/admin/users/:id/login-email',
  },
  escrows: {
    list: '/v1/admin/escrows',
    dossier: '/v1/admin/escrows/:id/dossier',
    setHidden: '/v1/admin/escrows/:id/hidden',
  },
  disputes: {
    list: '/v1/admin/disputes',
    get: '/v1/admin/disputes/:id',
    claim: '/v1/admin/disputes/:id/claim',
    release: '/v1/admin/disputes/:id/release',
    // Issue-3: the dispute's proposed resolution (GET latest / POST propose).
    resolution: '/v1/admin/disputes/:id/resolution',
  },
  resolutions: {
    list: '/v1/admin/resolutions',
    reject: '/v1/admin/resolutions/:id/reject',
    executeBuild: '/v1/admin/resolutions/:id/execute-build',
    broadcast: '/v1/admin/resolutions/:id/broadcast',
  },
  disputeThread: {
    // Thread routes live on the escrow (shared with the parties). There is
    // deliberately NO resolve path here: resolution is an on-chain tx
    // signed by the dispute-admin key via the party-facing flow — the
    // dashboard documents that hand-off instead of wiring it.
    messages: '/v1/escrows/:id/dispute/messages',
  },
  reports: {
    list: '/v1/admin/reports',
    action: '/v1/admin/reports/:id',
  },
  featured: {
    list: '/v1/admin/featured',
    create: '/v1/admin/featured',
    update: '/v1/admin/featured/:id',
    remove: '/v1/admin/featured/:id',
  },
  standing: {
    get: '/v1/admin/standing/:user_id',
    override: '/v1/admin/standing/:user_id/override',
  },
  platformConfig: '/v1/admin/platform-config',
  announcements: {
    list: '/v1/admin/announcements',
    create: '/v1/admin/announcements',
    update: '/v1/admin/announcements/:id',
    remove: '/v1/admin/announcements/:id',
  },
  moderation: {
    verdicts: '/v1/admin/moderation/verdicts',
    override: '/v1/admin/moderation/verdicts/:id/override',
  },
  finance: { fees: '/v1/admin/finance/fees' },
  metrics: '/v1/admin/metrics',
  fiat: {
    intents: '/v1/admin/fiat/intents',
    forceSettle: '/v1/admin/fiat/intents/:id/force-settle',
    refund: '/v1/admin/fiat/intents/:id/refund',
    providers: '/v1/admin/fiat/providers',
    updateProvider: '/v1/admin/fiat/providers/:id',
  },
  push: { broadcast: '/v1/admin/push/broadcast' },
} as const

/** Replace :params in a route path; throws on a missing param. */
export function buildPath(template: string, params: Record<string, string>): string {
  return template.replace(/:([A-Za-z_]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`missing path param '${name}' for ${template}`)
    return encodeURIComponent(value)
  })
}
