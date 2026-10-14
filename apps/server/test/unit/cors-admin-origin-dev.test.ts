/**
 * CORS plugin, dev semantics: with ADMIN_ORIGIN unset the admin-origin hook is
 * allow-all (documented in plugins/cors.ts). Its own file because the plugin
 * reads config once per process and cors.test.ts needs the opposite setting.
 */
import '../helpers/test-app/env'
import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import corsPlugin from '@server/plugins/cors'

delete process.env.CORS_ORIGIN
delete process.env.ADMIN_ORIGIN

test('with ADMIN_ORIGIN unset any browser origin may reach an admin route (dev allow-all)', async () => {
  const app = Fastify()
  await app.register(corsPlugin)
  app.get('/v1/admin/x', async () => ({ ok: true }))
  await app.ready()
  const res = await app.inject({ method: 'GET', url: '/v1/admin/x', headers: { origin: 'https://anything.example' } })
  assert.strictEqual(res.statusCode, 200)
  await app.close()
})
