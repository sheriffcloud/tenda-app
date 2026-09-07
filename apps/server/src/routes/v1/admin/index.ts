// Parent scope plugin for all /v1/admin/* routes.
//
// IMPORTANT (autoload semantics): because this directory has an index file,
// @fastify/autoload loads ONLY this file, sibling route files are NOT
// auto-registered ("…unless the directory contains an index file. In which
// case, only the index file (and the potential sub-directories) will be
// loaded"). Every admin module must therefore be registered EXPLICITLY
// below; a module missing from this list is silently unreachable. The
// integration suite (test/integration/admin-permissions.test.ts) covers the
// wiring.
import { FastifyPluginAsync } from 'fastify'
import { ADMIN_ROLES } from '@tenda/shared'
import { requireRole } from '@server/lib/guards'
import announcements from './announcements'
import disputes from './disputes'
import escrows from './escrows'
import featured from './featured'
import fiat from './fiat'
import finance from './finance'
import loginEmail from './login-email'
import metrics from './metrics'
import moderation from './moderation'
import platformConfig from './platform-config'
import push from './push'
import reports from './reports'
import resolutions from './resolutions'
import standing from './standing'
import users from './users'

const adminScope: FastifyPluginAsync = async (fastify) => {
  // NOTE: admin-origin enforcement lives in plugins/cors.ts (the single
  // enforcement point, it also owns the preflight semantics the #90
  // dashboard needs). Duplicating an origin hook here once caused the two
  // checks to disagree about dev behaviour.

  // All admin routes require a valid JWT and at minimum any admin role.
  // Individual routes add the granular requirePermission guard on top.
  fastify.addHook('preHandler', fastify.authenticate)
  fastify.addHook('preHandler', requireRole(...ADMIN_ROLES))

  await fastify.register(announcements, { prefix: '/announcements' })
  await fastify.register(disputes, { prefix: '/disputes' })
  await fastify.register(escrows, { prefix: '/escrows' })
  await fastify.register(featured, { prefix: '/featured' })
  await fastify.register(fiat, { prefix: '/fiat' })
  await fastify.register(finance, { prefix: '/finance' })
  // Shares the /users prefix with the users module (#87 provisioning).
  await fastify.register(loginEmail, { prefix: '/users' })
  await fastify.register(metrics, { prefix: '/metrics' })
  await fastify.register(moderation, { prefix: '/moderation' })
  await fastify.register(platformConfig, { prefix: '/platform-config' })
  await fastify.register(push, { prefix: '/push' })
  await fastify.register(reports, { prefix: '/reports' })
  await fastify.register(resolutions, { prefix: '/resolutions' })
  await fastify.register(standing, { prefix: '/standing' })
  await fastify.register(users, { prefix: '/users' })
}

export default adminScope
