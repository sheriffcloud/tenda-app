/**
 * /v1/webhooks — explicit mounting for the provider modules that are FILES.
 *
 * WHY THIS FILE EXISTS. @fastify/autoload gives a DIRECTORY its name as a route
 * prefix; a bare file inherits only its parent's. `helius.ts` is a bare file, so
 * its `post('/')` landed on the bare `/v1/webhooks` while its own docblock and
 * docs/production_setup_guide.md §4.5 both tell operators to point Helius at
 * `/v1/webhooks/helius` — a path that 404ed. Same shape, same silent failure
 * mode as the one `routes/v1/blockchain/index.ts` was written to fix.
 *
 * WHAT AUTOLOAD DOES WITH THE SIBLINGS, measured from the route tree rather than
 * assumed: with an index file present it loads ONLY the index **and the
 * sub-directories** (@fastify/autoload 6.3.1 README). alchemy/, onrampmoney/ and
 * yellowcard/ are directories, so they still mount themselves at their own
 * names. Registering them here as well declares each route twice and fails boot
 * — measured: FST_ERR_DUPLICATED_ROUTE, "Method 'POST' already declared for
 * route '/v1/webhooks/alchemy'". So do NOT add them, even though
 * `routes/v1/admin/index.ts` says every module must be listed: that rule is
 * about sibling FILES, which is what admin and blockchain contain and what this
 * directory has exactly one of.
 *
 * NO COMPATIBILITY PERIOD, and that was checked rather than assumed: a webhook's
 * inbound path lives only in the provider's dashboard (env carries the secret,
 * never the URL), and the runbook records the Helius hook as pending user action
 * (#43, §4.5) — so nothing deployed can be calling the bare prefix. The other
 * three providers are directories and never moved.
 *
 * The whole arrangement is pinned by test/integration/webhook-routes.test.ts.
 */

import type { FastifyPluginAsync } from 'fastify'
import helius from './helius'

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(helius, { prefix: '/helius' })
}

export default webhookRoutes
