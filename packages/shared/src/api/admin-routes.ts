/**
 * The admin dashboard's request paths (#90, moved here by #121).
 *
 * WHY THIS LIVES IN SHARED AND NOT IN apps/admin, which is where it was until
 * #121: a route's URL on the server is a function of the FILESYSTEM
 * (@fastify/autoload — a directory contributes its name to the prefix, a bare
 * file does not), and that has silently moved a path twice already: the
 * client-ping, and #106's Helius webhook. While this map lived in apps/admin
 * nothing could compare it against the server, because the server's test
 * package cannot import an app. A rename on either side would have left the
 * dashboard 404ing on that screen with every test in the repository green.
 *
 * Here, `test/integration/api-routes-drift.test.ts` probes these paths against
 * the live route table exactly as it already probes `apiRoutes`. That is the
 * whole point of the move — not tidiness, an assertion that could not otherwise
 * exist.
 *
 * IT IS DELIBERATELY NOT EXPORTED FROM THIS PACKAGE'S BARREL. Reach it only via
 * the `@tenda/shared/api/admin` subpath. `apiRoutes` types what web and mobile
 * call; these are dashboard surfaces, and neither mobile client has any use for
 * them. Keeping it off `index.ts` is what stops the move from widening what
 * every consumer of this package compiles against — the objection raised when
 * #121 was decided, and this is the answer to it.
 *
 * Path params use `:placeholders`, resolved by `buildPath` in
 * apps/admin/api/routes.ts. Two entries may share a URL where the method is
 * what distinguishes them (grant/revoke a login email; list/create; update/
 * remove) — that is intentional, and the drift check dedupes.
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
    //
    // This one path is ALSO in `apiRoutes` (escrows.disputeMessages), because
    // the parties' clients call it too. Being declared twice is harmless: the
    // drift check unions both maps, so it is simply covered by both.
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
